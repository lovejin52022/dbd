import type { LifecycleStatus } from '../../shared/types';
import {
  calcOfferFireAt,
  DEFAULT_OFFER_ADVANCE_MAX_MS,
  DEFAULT_OFFER_ADVANCE_MIN_MS,
  FAST_POLL_BEFORE_END_MS,
  pickOfferAdvanceMs,
} from '../../shared/offer-schedule';
import { ClockSync } from './clock-sync';

/** 数据库行（snake_case） */
export interface DbAuctionRow {
  id: string;
  lifecycle_status: LifecycleStatus;
  auction_start_time: number | null;
  auction_end_time: number | null;
  auto_order_enabled: number;
  offer_advance_min_ms: number | null;
  offer_advance_max_ms: number | null;
}

export interface ItemRunnerCallbacks {
  onBecomeInProgress: (id: string) => void;
  onExpire: (id: string) => void;
  onOfferPrice: (id: string) => void;
  onFastPoll: (id: string) => void;
}

/** 快轮询随机间隔：10–100ms */
export function randomFastPollDelay(): number {
  return 10 + Math.floor(Math.random() * 91);
}

/** 临近 fireAt 时的细粒度等待间隔（毫秒） */
const FINE_WAIT_MS = 10;

/** 进入细粒度等待前的提前量（毫秒） */
const FINE_WAIT_LEAD_MS = 20;

/**
 * 按校准后服务器时间调度出价：粗 setTimeout + 末段细粒度对齐 fireAt。
 * 快轮询已持续更新现价，触发时不再额外 poll。
 */
export function scheduleOfferPrice(params: {
  auctionEndTime: number;
  advanceMinMs: number;
  advanceMaxMs: number;
  clock: ClockSync;
  onFire: () => void;
  trackTimer?: (timer: NodeJS.Timeout) => void;
}): void {
  const advanceMs = pickOfferAdvanceMs(params.advanceMinMs, params.advanceMaxMs);
  const fireAt = calcOfferFireAt({
    auctionEndTime: params.auctionEndTime,
    advanceMs,
    estimatedOfferRttMs: params.clock.getEstimatedRttMs(),
  });

  const track = (timer: NodeJS.Timeout): void => {
    params.trackTimer?.(timer);
  };

  const tryFire = (): void => {
    const remaining = fireAt - params.clock.serverNow();
    if (remaining > 1) {
      track(setTimeout(tryFire, Math.min(remaining, FINE_WAIT_MS)));
      return;
    }
    params.onFire();
  };

  const initialRemaining = fireAt - params.clock.serverNow();
  if (initialRemaining <= 0) {
    tryFire();
    return;
  }

  const coarseDelay = Math.max(0, initialRemaining - FINE_WAIT_LEAD_MS);
  track(setTimeout(tryFire, coarseDelay));
}

/**
 * 单条目调度状态机：
 * - not_started：监视开始时间；若开启自动出价则按结束时间挂出价/快轮询
 * - in_progress + autoOrder：结束前 10s 快轮询 + 结束前 N ms 精准出价
 */
export class ItemRunner {
  private timers = new Set<NodeJS.Timeout>();
  private fastPollActive = false;
  private offerScheduled = false;
  private disposed = false;

  constructor(
    private row: DbAuctionRow,
    private clock: ClockSync,
    private callbacks: ItemRunnerCallbacks,
  ) {
    this.init();
  }

  /** 取消所有定时器 */
  dispose(): void {
    this.disposed = true;
    this.fastPollActive = false;
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
  }

  private init(): void {
    if (this.row.lifecycle_status === 'not_started') {
      this.scheduleBecomeInProgress();
    }

    if (this.row.auto_order_enabled) {
      this.scheduleAutoOrderTimers();
    }
  }

  private getAdvanceRange(): { minMs: number; maxMs: number } {
    return {
      minMs: this.row.offer_advance_min_ms ?? DEFAULT_OFFER_ADVANCE_MIN_MS,
      maxMs: this.row.offer_advance_max_ms ?? DEFAULT_OFFER_ADVANCE_MAX_MS,
    };
  }

  private trackTimer(timer: NodeJS.Timeout): void {
    this.timers.add(timer);
  }

  /** not_started → in_progress：到点开始时间回调 */
  private scheduleBecomeInProgress(): void {
    const start = this.row.auction_start_time;
    if (start == null) return;

    const delay = Math.max(0, start - this.clock.serverNow());
    const timer = setTimeout(() => {
      if (this.disposed) return;
      this.row.lifecycle_status = 'in_progress';
      this.callbacks.onBecomeInProgress(this.row.id);
    }, delay);
    this.trackTimer(timer);
  }

  /** 自动出价：T-10s（相对结束）快轮询 + T-(min~max ms) 出价 */
  private scheduleAutoOrderTimers(): void {
    const end = this.row.auction_end_time;
    if (end == null) return;

    const serverNow = this.clock.serverNow();
    const msToEnd = end - serverNow;

    if (msToEnd <= 0) {
      // 已过结束点但尚未标记 expired 时，不再抢出
      return;
    }

    if (msToEnd > FAST_POLL_BEFORE_END_MS) {
      const entryDelay = Math.max(0, end - FAST_POLL_BEFORE_END_MS - serverNow);
      const entryTimer = setTimeout(() => {
        if (this.disposed || this.row.lifecycle_status === 'expired') return;
        this.startFastPollLoop();
      }, entryDelay);
      this.trackTimer(entryTimer);
    } else {
      this.startFastPollLoop();
    }

    this.scheduleOfferOnce();
  }

  /** 每条目仅调度一次 offerPrice */
  private scheduleOfferOnce(): void {
    if (this.offerScheduled) return;
    this.offerScheduled = true;

    const end = this.row.auction_end_time;
    if (end == null) return;

    const { minMs, maxMs } = this.getAdvanceRange();
    scheduleOfferPrice({
      auctionEndTime: end,
      advanceMinMs: minMs,
      advanceMaxMs: maxMs,
      clock: this.clock,
      trackTimer: (timer) => this.trackTimer(timer),
      onFire: () => {
        if (this.disposed) return;
        this.callbacks.onOfferPrice(this.row.id);
      },
    });
  }

  /** 10–100ms 随机间隔快轮询，直到抢购结束 */
  private startFastPollLoop(): void {
    if (this.fastPollActive || this.disposed) return;
    this.fastPollActive = true;

    const poll = (): void => {
      if (this.disposed) {
        this.fastPollActive = false;
        return;
      }

      const end = this.row.auction_end_time;
      if (end == null || this.clock.serverNow() >= end) {
        this.fastPollActive = false;
        return;
      }

      this.callbacks.onFastPoll(this.row.id);
      const timer = setTimeout(poll, randomFastPollDelay());
      this.trackTimer(timer);
    };

    poll();
  }
}

// 供单元测试引用
export { pickOfferAdvanceMs };
