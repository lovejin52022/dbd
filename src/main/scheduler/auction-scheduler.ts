import type Database from 'better-sqlite3';
import { listByLifecycle } from '../db/auction-list.repo';
import { insertBidRecordsSnapshot } from '../db/bid-records.repo';
import {
  JD_FUNCTIONS,
  buildBidRecordsBody,
  buildStatusBody,
  buildOfferPriceBody,
} from '../../shared/constants';
import { calcOfferPrice } from '../../shared/order-price';
import { resolveLifecycleStatus } from '../../shared/lifecycle';
import { parseStatusResponse } from '../services/detail-parser';
import { isJdApiUnavailableError, type JdApiService } from '../services/jd-api.service';
import { ClockSync } from './clock-sync';
import { ItemRunner, type DbAuctionRow } from './item-runner';

/** 慢轮询间隔（毫秒） */
const SLOW_POLL_INTERVAL_MS = 60_000;

/** 拍卖调度器：慢/快轮询、生命周期转换、精准出价 */
export class AuctionScheduler {
  private slowTimer: NodeJS.Timeout | null = null;
  private runners = new Map<string, ItemRunner>();
  private clock = new ClockSync();
  private paused = false;

  constructor(
    private db: Database.Database,
    private jdApi: JdApiService,
    private notify: (title: string, body: string) => void,
    private onListUpdated?: () => void,
    private onPaused?: (reason: string) => void,
  ) {}

  start(): void {
    this.bootstrapRunners();
    this.slowTimer = setInterval(() => void this.runSlowPoll(), SLOW_POLL_INTERVAL_MS);
  }

  stop(): void {
    if (this.slowTimer) {
      clearInterval(this.slowTimer);
      this.slowTimer = null;
    }
    for (const runner of this.runners.values()) runner.dispose();
    this.runners.clear();
  }

  /** Webview / ParamsSign 不可用时暂停调度 */
  pause(_reason: string): void {
    if (this.paused) return;
    this.paused = true;
    this.stop();
  }

  /** Webview 就绪后恢复调度 */
  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    this.start();
  }

  isPaused(): boolean {
    return this.paused;
  }

  /** 捕获不可用错误并暂停调度，返回 true 表示已处理 */
  private handleApiUnavailable(err: unknown): boolean {
    if (!isJdApiUnavailableError(err)) return false;
    const reason = err instanceof Error ? err.message : String(err);
    this.pause(reason);
    this.onPaused?.(reason);
    return true;
  }

  /** 配置变更后重建单条目 runner */
  refreshItem(id: string): void {
    this.runners.get(id)?.dispose();
    this.runners.delete(id);
    this.bootstrapRunners();
  }

  /** 为非 expired、数据完整的条目创建 runner */
  private bootstrapRunners(): void {
    const rows = this.db
      .prepare(
        `SELECT * FROM auction_list
         WHERE lifecycle_status != ? AND data_incomplete = 0`,
      )
      .all('expired') as DbAuctionRow[];

    for (const row of rows) {
      if (!this.runners.has(row.id)) {
        this.runners.set(
          row.id,
          new ItemRunner(row, this.clock, {
            onBecomeInProgress: (auctionId) => this.onBecomeInProgress(auctionId),
            onExpire: (auctionId) => void this.fetchBidRecordsOnce(auctionId),
            onOfferPrice: (auctionId) => void this.executeOfferPrice(auctionId),
            onFastPoll: (auctionId) => void this.pollStatus(auctionId),
          }),
        );
      }
    }
  }

  private onBecomeInProgress(auctionId: string): void {
    this.db
      .prepare(`UPDATE auction_list SET lifecycle_status = 'in_progress' WHERE id = ?`)
      .run(auctionId);
    void this.runSlowPollFor([auctionId]);
  }

  /** 60s 慢轮询：仅 in_progress 条目 */
  private async runSlowPoll(): Promise<void> {
    const ids = listByLifecycle(this.db, 'in_progress').map((r) => r.id);
    if (ids.length === 0) return;
    await this.runSlowPollFor(ids);
  }

  /** 批量 status + 逐条 bidrecords，更新 DB 并检测过期 */
  private async runSlowPollFor(ids: string[]): Promise<void> {
    try {
      const statusJson = await this.jdApi.call(
        JD_FUNCTIONS.CURRENT_AND_OFFER,
        buildStatusBody(ids),
      );

      for (const id of ids) {
        const parsed = parseStatusResponse(statusJson, id);
        if (parsed.serverTimeMs) this.clock.addSample(parsed.serverTimeMs);

        const row = this.db
          .prepare('SELECT address FROM auction_list WHERE id = ?')
          .get(id) as { address: string | null } | undefined;
        if (!row?.address) continue;

        const bidJson = await this.jdApi.call(
          JD_FUNCTIONS.BID_RECORDS,
          buildBidRecordsBody(id, row.address),
        );
        insertBidRecordsSnapshot(this.db, id, bidJson);
        this.updateListFromStatus(id, parsed, 'slow_poll');
        this.maybeExpire(id, parsed);
      }
      this.onListUpdated?.();
    } catch (err) {
      this.handleApiUnavailable(err);
    }
  }

  /** 过期时拉一次 bidrecords 并标记终态 */
  async fetchBidRecordsOnce(auctionId: string): Promise<void> {
    const row = this.db
      .prepare('SELECT address FROM auction_list WHERE id = ?')
      .get(auctionId) as { address: string | null } | undefined;
    if (!row?.address) return;

    try {
      const bidJson = await this.jdApi.call(
        JD_FUNCTIONS.BID_RECORDS,
        buildBidRecordsBody(auctionId, row.address),
      );
      insertBidRecordsSnapshot(this.db, auctionId, bidJson);
      this.db
        .prepare(
          `UPDATE auction_list SET lifecycle_status = 'expired', scheduler_phase = 'done' WHERE id = ?`,
        )
        .run(auctionId);
    } catch (err) {
      if (this.handleApiUnavailable(err)) return;
      throw err;
    }
  }

  /** 精准出价：每条目仅触发一次 */
  private async executeOfferPrice(auctionId: string): Promise<void> {
    const row = this.db.prepare('SELECT * FROM auction_list WHERE id = ?').get(auctionId) as {
      id: string;
      address: string | null;
      target_price: number | null;
      current_price: number | null;
      auto_order_enabled: number;
      order_result: string;
    } | undefined;

    if (!row?.auto_order_enabled || !row.address) return;
    // 已出过价则不再重复
    if (row.order_result !== 'pending') return;

    this.db
      .prepare(`UPDATE auction_list SET scheduler_phase = 'firing' WHERE id = ?`)
      .run(auctionId);

    const price = calcOfferPrice(row.current_price ?? 0, row.target_price);
    try {
      const body = buildOfferPriceBody({
        auctionId: row.id,
        price,
        ts: Date.now(),
        address: row.address,
      });
      await this.jdApi.call(JD_FUNCTIONS.OFFER_PRICE, body);
      this.db
        .prepare(`UPDATE auction_list SET order_result = 'success', scheduler_phase = 'done' WHERE id = ?`)
        .run(auctionId);
      this.notify('出价成功', `商品 ${auctionId} 已提交出价 ${price} 元`);
    } catch (err) {
      if (this.handleApiUnavailable(err)) return;
      const msg = err instanceof Error ? err.message : String(err);
      this.db
        .prepare(
          `UPDATE auction_list SET order_result = 'failed', order_error = ?, scheduler_phase = 'done' WHERE id = ?`,
        )
        .run(msg, auctionId);
      this.notify('出价失败', msg);
    }
  }

  /** 快轮询：仅拉 status 更新现价与时钟 */
  private async pollStatus(auctionId: string): Promise<void> {
    try {
      const statusJson = await this.jdApi.call(
        JD_FUNCTIONS.CURRENT_AND_OFFER,
        buildStatusBody(auctionId),
      );
      const parsed = parseStatusResponse(statusJson, auctionId);
      if (parsed.serverTimeMs) this.clock.addSample(parsed.serverTimeMs);
      this.updateListFromStatus(auctionId, parsed, 'fast_poll');
    } catch (err) {
      this.handleApiUnavailable(err);
    }
  }

  private updateListFromStatus(
    auctionId: string,
    parsed: ReturnType<typeof parseStatusResponse>,
    phase: 'slow_poll' | 'fast_poll',
  ): void {
    this.db
      .prepare(
        `UPDATE auction_list SET
          current_price = ?, bid_count = ?, auction_status = ?,
          last_polled_at = ?, scheduler_phase = ?
        WHERE id = ?`,
      )
      .run(
        parsed.currentPrice,
        parsed.bidCount,
        parsed.auctionStatus,
        new Date().toISOString(),
        phase,
        auctionId,
      );
  }

  private maybeExpire(
    auctionId: string,
    parsed: ReturnType<typeof parseStatusResponse>,
  ): void {
    const row = this.db
      .prepare('SELECT auction_end_time FROM auction_list WHERE id = ?')
      .get(auctionId) as { auction_end_time: number | null } | undefined;

    const next = resolveLifecycleStatus({
      nowMs: this.clock.serverNow(),
      startTimeMs: null,
      endTimeMs: row?.auction_end_time ?? null,
      platformStatusExpired: parsed.platformStatusExpired,
    });

    if (next === 'expired') {
      this.runners.get(auctionId)?.dispose();
      this.runners.delete(auctionId);
      void this.fetchBidRecordsOnce(auctionId);
    }
  }
}
