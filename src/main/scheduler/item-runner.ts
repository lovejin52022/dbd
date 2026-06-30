import type { LifecycleStatus } from '../../shared/types';
import { ClockSync } from './clock-sync';

/** 数据库行（snake_case） */
export interface DbAuctionRow {
  id: string;
  lifecycle_status: LifecycleStatus;
  auction_start_time: number | null;
  auto_order_enabled: number;
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

/** 计算出价定时器延迟（毫秒），供 scheduleOfferPrice 与单元测试使用 */
export function calcOfferScheduleDelay(params: {
  auctionStartTime: number;
  serverNowMs: number;
  advanceMs: number;
}): number {
  const fireAt = params.auctionStartTime - params.advanceMs;
  return Math.max(0, fireAt - params.serverNowMs);
}

/** 在抢购开始前 80–100ms（随机）触发出价 */
export function scheduleOfferPrice(params: {
  auctionStartTime: number;
  clock: ClockSync;
  onFire: () => void;
}): NodeJS.Timeout {
  const advanceMs = 80 + Math.floor(Math.random() * 21);
  const delay = calcOfferScheduleDelay({
    auctionStartTime: params.auctionStartTime,
    serverNowMs: params.clock.serverNow(),
    advanceMs,
  });
  return setTimeout(params.onFire, delay);
}

/** 距开始 10 秒内快轮询窗口（毫秒） */
const FAST_POLL_WINDOW_MS = 10_000;

/**
 * 单条目调度状态机：
 * - not_started：零轮询，setTimeout 监视开始时间
 * - in_progress + autoOrder：开始前 10s 快轮询 + 精准出价（各仅一次）
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
      if (this.row.auto_order_enabled) {
        this.scheduleAutoOrderTimers();
      }
      return;
    }

    // 应用重启后若仍在开始前 10s 窗口内，补挂快轮询与出价
    if (this.row.lifecycle_status === 'in_progress' && this.row.auto_order_enabled) {
      this.maybeResumeAutoOrder();
    }
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

  /** 自动出价：T-10s 进入快轮询 + T-(80~100ms) 出价 */
  private scheduleAutoOrderTimers(): void {
    const start = this.row.auction_start_time;
    if (start == null) return;

    const entryDelay = Math.max(0, start - FAST_POLL_WINDOW_MS - this.clock.serverNow());
    const entryTimer = setTimeout(() => {
      if (this.disposed || this.row.lifecycle_status === 'expired') return;
      this.startFastPollLoop();
    }, entryDelay);
    this.trackTimer(entryTimer);

    this.scheduleOfferOnce();
  }

  /** 重启后距开始仍 ≤10s 时恢复快轮询/出价 */
  private maybeResumeAutoOrder(): void {
    const start = this.row.auction_start_time;
    if (start == null) return;

    const msToStart = start - this.clock.serverNow();
    if (msToStart > 0 && msToStart <= FAST_POLL_WINDOW_MS) {
      this.startFastPollLoop();
      this.scheduleOfferOnce();
    }
  }

  /** 每条目仅调度一次 offerPrice */
  private scheduleOfferOnce(): void {
    if (this.offerScheduled) return;
    this.offerScheduled = true;

    const start = this.row.auction_start_time;
    if (start == null) return;

    const timer = scheduleOfferPrice({
      auctionStartTime: start,
      clock: this.clock,
      onFire: () => {
        if (this.disposed) return;
        this.callbacks.onOfferPrice(this.row.id);
      },
    });
    this.trackTimer(timer);
  }

  /** 10–100ms 随机间隔快轮询，直到抢购开始 */
  private startFastPollLoop(): void {
    if (this.fastPollActive || this.disposed) return;
    this.fastPollActive = true;

    const poll = (): void => {
      if (this.disposed) {
        this.fastPollActive = false;
        return;
      }

      const start = this.row.auction_start_time;
      if (start == null || this.clock.serverNow() >= start) {
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
