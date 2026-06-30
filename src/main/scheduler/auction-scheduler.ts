import type Database from 'better-sqlite3';
import { listByLifecycle } from '../db/auction-list.repo';
import { getLatestDetailSnapshot } from '../db/auction-detail.repo';
import { insertBidRecordsSnapshot } from '../db/bid-records.repo';
import {
  JD_FUNCTIONS,
  buildBidRecordsBody,
  buildStatusBody,
  buildOfferPriceBody,
  buildSaleInfoBody,
} from '../../shared/constants';
import { calcOfferPrice } from '../../shared/order-price';
import { resolveLifecycleStatus } from '../../shared/lifecycle';
import { parseDetailResponse, parseSaleInfoResponse, parseStatusResponse, parseAddressFromJson } from '../services/detail-parser';
import { resolveAuctionAddress } from '../services/auction-ingest.service';
import { assertJdApiOk } from '../services/jd-response';
import { isJdApiUnavailableError, isWebviewNotReadyError, type JdApiService } from '../services/jd-api.service';
import { parseOfferPriceResponse } from '../services/jd-response';
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
    if (this.paused) return;
    this.hydrateAllTimesFromSnapshots();
    this.hydrateAllAddressesFromSnapshots();
    this.syncLifecycleFromTimes();
    this.bootstrapRunners();
    // 启动后立即执行一次慢轮询，再每 60s 重复
    void this.runSlowPoll();
    if (!this.slowTimer) {
      this.slowTimer = setInterval(() => void this.runSlowPoll(), SLOW_POLL_INTERVAL_MS);
    }
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
    this.hydrateTimesFromDetailSnapshot(id);
    this.hydrateAddressFromSnapshots(id);
    this.syncLifecycleFromTimes();
    this.bootstrapRunners();
  }

  /** 加入列表或状态变化后，对抢购中条目立即慢轮询 */
  pollInProgressNow(auctionId?: string): void {
    if (auctionId) {
      const row = this.db
        .prepare('SELECT lifecycle_status FROM auction_list WHERE id = ?')
        .get(auctionId) as { lifecycle_status: string } | undefined;
      if (row?.lifecycle_status === 'in_progress') {
        void this.runSlowPollFor([auctionId]);
      }
      return;
    }
    void this.runSlowPoll();
  }

  /** 从详情快照补全缺失的开始/结束时间 */
  private hydrateTimesFromDetailSnapshot(auctionId: string): void {
    const row = this.db
      .prepare(
        'SELECT auction_start_time, auction_end_time FROM auction_list WHERE id = ?',
      )
      .get(auctionId) as { auction_start_time: number | null; auction_end_time: number | null } | undefined;
    if (!row || (row.auction_start_time != null && row.auction_end_time != null)) return;

    const snap = getLatestDetailSnapshot(this.db, auctionId);
    if (!snap) return;

    try {
      const parsed = parseDetailResponse(JSON.parse(snap.detail_json) as unknown);
      if (parsed.auctionStartTime == null && parsed.auctionEndTime == null) return;
      this.db
        .prepare(`
          UPDATE auction_list SET
            auction_start_time = COALESCE(auction_start_time, @start),
            auction_end_time = COALESCE(auction_end_time, @end)
          WHERE id = @id
        `)
        .run({
          id: auctionId,
          start: parsed.auctionStartTime,
          end: parsed.auctionEndTime,
        });
    } catch {
      // 快照解析失败时跳过
    }
  }

  private hydrateAllTimesFromSnapshots(): void {
    const rows = this.db.prepare('SELECT id FROM auction_list').all() as { id: string }[];
    for (const row of rows) {
      this.hydrateTimesFromDetailSnapshot(row.id);
    }
  }

  private hydrateAllAddressesFromSnapshots(): void {
    const rows = this.db.prepare('SELECT id FROM auction_list').all() as { id: string }[];
    for (const row of rows) {
      this.hydrateAddressFromSnapshots(row.id);
    }
  }

  /** 从详情 / saleInfo 快照补全 address（bidrecords 必需） */
  private hydrateAddressFromSnapshots(auctionId: string): void {
    const row = this.db
      .prepare('SELECT address FROM auction_list WHERE id = ?')
      .get(auctionId) as { address: string | null } | undefined;
    if (row?.address) return;

    const snap = getLatestDetailSnapshot(this.db, auctionId);
    if (!snap) return;

    try {
      const saleInfo = JSON.parse(snap.sale_info_json) as unknown;
      const detail = JSON.parse(snap.detail_json) as unknown;
      const address = resolveAuctionAddress(detail, saleInfo);
      if (!address) return;
      this.db.prepare('UPDATE auction_list SET address = ? WHERE id = ?').run(address, auctionId);
    } catch {
      // 快照解析失败时跳过
    }
  }

  /** 慢轮询前确保有 address，必要时重新请求 saleInfo */
  private async ensureAddress(auctionId: string): Promise<string | null> {
    this.hydrateAddressFromSnapshots(auctionId);
    const row = this.db
      .prepare('SELECT address FROM auction_list WHERE id = ?')
      .get(auctionId) as { address: string | null } | undefined;
    if (row?.address) return row.address;

    try {
      const saleInfoJson = await this.jdApi.call(
        JD_FUNCTIONS.SALE_INFO,
        buildSaleInfoBody(auctionId),
      );
      assertJdApiOk(saleInfoJson, 'dbd.auction.detail.saleInfo');
      const address = parseSaleInfoResponse(saleInfoJson).address ?? parseAddressFromJson(saleInfoJson);
      if (address) {
        this.db
          .prepare('UPDATE auction_list SET address = ? WHERE id = ?')
          .run(address, auctionId);
        return address;
      }
    } catch (err) {
      if (isWebviewNotReadyError(err)) return null;
      this.handleApiUnavailable(err);
    }
    return null;
  }

  /** 根据开始/结束时间同步 DB 中的 lifecycle_status */
  private syncLifecycleFromTimes(): void {
    const rows = this.db
      .prepare(
        `SELECT id, lifecycle_status, auction_start_time, auction_end_time
         FROM auction_list WHERE lifecycle_status != 'expired'`,
      )
      .all() as {
      id: string;
      lifecycle_status: string;
      auction_start_time: number | null;
      auction_end_time: number | null;
    }[];

    for (const row of rows) {
      const next = resolveLifecycleStatus({
        nowMs: Date.now(),
        startTimeMs: row.auction_start_time,
        endTimeMs: row.auction_end_time,
      });
      if (next === row.lifecycle_status) continue;

      this.db
        .prepare('UPDATE auction_list SET lifecycle_status = ? WHERE id = ?')
        .run(next, row.id);
      this.runners.get(row.id)?.dispose();
      this.runners.delete(row.id);

      if (next === 'expired') {
        void this.fetchBidRecordsOnce(row.id);
      }
    }

    // 生命周期切换后统一补建 runner（避免出价定时器丢失）
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
    this.onListUpdated?.();
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

        // 无论是否有 address，都更新抢购状态与 last_polled_at
        this.updateListFromStatus(id, parsed, 'slow_poll');
        this.maybeExpire(id, parsed);

        const address = await this.ensureAddress(id);
        if (!address) continue;

        try {
          const bidJson = await this.jdApi.call(
            JD_FUNCTIONS.BID_RECORDS,
            buildBidRecordsBody(id, address),
          );
          insertBidRecordsSnapshot(this.db, id, bidJson);
        } catch (err) {
          // 单条 bidrecords 失败不影响其他条目与 status 轮询
          if (isWebviewNotReadyError(err)) continue;
          this.handleApiUnavailable(err);
        }
      }
      this.onListUpdated?.();
    } catch (err) {
      if (isWebviewNotReadyError(err)) return;
      this.handleApiUnavailable(err);
    }
  }

  /** 过期时拉一次 bidrecords 并标记终态 */
  async fetchBidRecordsOnce(auctionId: string): Promise<void> {
    const address = await this.ensureAddress(auctionId);
    if (!address) return;

    try {
      const bidJson = await this.jdApi.call(
        JD_FUNCTIONS.BID_RECORDS,
        buildBidRecordsBody(auctionId, address),
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
    let row = this.db.prepare('SELECT * FROM auction_list WHERE id = ?').get(auctionId) as {
      id: string;
      address: string | null;
      target_price: number | null;
      current_price: number | null;
      auto_order_enabled: number;
      order_result: string;
      auction_start_time: number | null;
    } | undefined;

    if (!row) return;

    if (!row.auto_order_enabled) {
      console.warn(`[出价跳过] ${auctionId}: 未开启自动出价`);
      return;
    }
    if (!row.address) {
      console.warn(`[出价跳过] ${auctionId}: 缺少 address`);
      this.notify('出价跳过', '缺少区域 address，无法出价');
      return;
    }
    // 已出过价则不再重复
    if (row.order_result !== 'pending') {
      console.warn(`[出价跳过] ${auctionId}: order_result=${row.order_result}`);
      return;
    }

    this.db
      .prepare(`UPDATE auction_list SET scheduler_phase = 'firing' WHERE id = ?`)
      .run(auctionId);
    this.onListUpdated?.();

    // 出价前拉一次最新现价
    await this.pollStatus(auctionId);
    row = this.db.prepare('SELECT * FROM auction_list WHERE id = ?').get(auctionId) as typeof row;

    const price = calcOfferPrice(row?.current_price ?? 0, row?.target_price);
    try {
      const body = buildOfferPriceBody({
        auctionId: row!.id,
        price,
        ts: Date.now(),
        address: row!.address!,
      });
      const json = await this.jdApi.call(JD_FUNCTIONS.OFFER_PRICE, body);
      const offerResult = parseOfferPriceResponse(json);
      if (!offerResult.success) {
        throw new Error(offerResult.message);
      }
      this.db
        .prepare(`UPDATE auction_list SET order_result = 'success', scheduler_phase = 'done' WHERE id = ?`)
        .run(auctionId);
      this.notify('出价成功', `${offerResult.message} · ¥${price}`);
      this.onListUpdated?.();
    } catch (err) {
      if (this.handleApiUnavailable(err)) return;
      const msg = err instanceof Error ? err.message : String(err);
      this.db
        .prepare(
          `UPDATE auction_list SET order_result = 'failed', order_error = ?, scheduler_phase = 'done' WHERE id = ?`,
        )
        .run(msg, auctionId);
      this.notify('出价失败', msg);
      this.onListUpdated?.();
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
      this.maybeExpire(auctionId, parsed);
      this.onListUpdated?.();
    } catch (err) {
      if (isWebviewNotReadyError(err)) return;
      this.handleApiUnavailable(err);
    }
  }

  private updateListFromStatus(
    auctionId: string,
    parsed: ReturnType<typeof parseStatusResponse>,
    phase: 'slow_poll' | 'fast_poll',
  ): void {
    const prev = this.db
      .prepare('SELECT auction_end_time, auto_order_enabled FROM auction_list WHERE id = ?')
      .get(auctionId) as { auction_end_time: number | null; auto_order_enabled: number } | undefined;

    this.db
      .prepare(
        `UPDATE auction_list SET
          current_price = ?, bid_count = ?, auction_status = ?,
          auction_end_time = COALESCE(?, auction_end_time),
          current_bidder = COALESCE(?, current_bidder),
          last_polled_at = ?, scheduler_phase = ?
        WHERE id = ?`,
      )
      .run(
        parsed.currentPrice,
        parsed.bidCount,
        parsed.auctionStatus,
        parsed.actualEndTimeMs,
        parsed.currentBidder,
        new Date().toISOString(),
        phase,
        auctionId,
      );

    // 结束时间更新后重建 runner，避免仍按旧时间出价
    if (
      parsed.actualEndTimeMs != null &&
      parsed.actualEndTimeMs !== prev?.auction_end_time &&
      prev?.auto_order_enabled
    ) {
      this.refreshItem(auctionId);
    }
  }

  private maybeExpire(
    auctionId: string,
    parsed: ReturnType<typeof parseStatusResponse>,
  ): void {
    const row = this.db
      .prepare('SELECT auction_end_time FROM auction_list WHERE id = ?')
      .get(auctionId) as { auction_end_time: number | null } | undefined;

    const endTimeMs = parsed.actualEndTimeMs ?? row?.auction_end_time ?? null;

    const next = resolveLifecycleStatus({
      nowMs: this.clock.serverNow(),
      startTimeMs: null,
      endTimeMs,
      platformStatusExpired: parsed.platformStatusExpired,
    });

    if (next === 'expired') {
      this.runners.get(auctionId)?.dispose();
      this.runners.delete(auctionId);
      void this.fetchBidRecordsOnce(auctionId);
    }
  }
}
