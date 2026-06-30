import { ipcMain } from 'electron';
import type Database from 'better-sqlite3';
import { JD_FUNCTIONS, buildAuctionHistoryBody, buildBidRecordsBody } from '../../shared/constants';
import type { AuctionHistoryItem } from '../../shared/types';
import { getLatestDetailSnapshot } from '../db/auction-detail.repo';
import { deleteAuction } from '../db/auction-list.repo';
import {
  getBidRecordsSummary,
  getLatestBidRecordsSnapshot,
  insertBidRecordsSnapshot,
} from '../db/bid-records.repo';
import type { AuctionScheduler } from '../scheduler/auction-scheduler';
import { ingestAuctionFromUrl } from '../services/auction-ingest.service';
import {
  parseDetailDisplayInfo,
  parseSaleInfoDisplayInfo,
  parseAuctionHistoryResponse,
  parseBidRecordsResponse,
  parseUsedNo,
  type DetailDisplayInfo,
  type SaleInfoDisplayInfo,
} from '../services/detail-parser';
import { assertJdApiOk } from '../services/jd-response';
import type { JdApiService } from '../services/jd-api.service';

/** 列表行附带最新详情摘要 */
function enrichAuctionRow(
  db: Database.Database,
  row: Record<string, unknown>,
): Record<string, unknown> & {
  detail_display: DetailDisplayInfo | null;
  sale_display: SaleInfoDisplayInfo | null;
  poll_summary: { bidRecordsCount: number; lastBidRecordsAt: string | null };
} {
  const pollSummary = getBidRecordsSummary(db, String(row.id));
  const poll_summary = {
    bidRecordsCount: pollSummary.count,
    lastBidRecordsAt: pollSummary.lastFetchedAt,
  };
  const snap = getLatestDetailSnapshot(db, String(row.id));
  if (!snap) return { ...row, detail_display: null, sale_display: null, poll_summary };
  try {
    const detailJson = JSON.parse(snap.detail_json) as unknown;
    const saleInfoJson = JSON.parse(snap.sale_info_json) as unknown;
    return {
      ...row,
      detail_display: parseDetailDisplayInfo(detailJson),
      sale_display: parseSaleInfoDisplayInfo(saleInfoJson),
      poll_summary,
    };
  } catch {
    return { ...row, detail_display: null, sale_display: null, poll_summary };
  }
}

/** 注册抢单列表相关 IPC 处理器 */
export function registerIpcHandlers(deps: {
  db: Database.Database;
  jdApi: JdApiService;
  scheduler: AuctionScheduler;
  notifyListUpdated: () => void;
}): void {
  ipcMain.handle('auction:add', async (_e, payload: {
    id: string; skuid: string | null; url: string; title: string;
  }) => {
    await ingestAuctionFromUrl(deps.db, deps.jdApi, payload);
    deps.scheduler.refreshItem(payload.id);
    deps.scheduler.pollInProgressNow(payload.id);
    deps.notifyListUpdated();
    const row = deps.db.prepare('SELECT * FROM auction_list WHERE id = ?').get(payload.id) as
      | Record<string, unknown>
      | undefined;
    return row ? enrichAuctionRow(deps.db, row) : null;
  });

  ipcMain.handle('auction:list', () => {
    const rows = deps.db
      .prepare('SELECT * FROM auction_list ORDER BY updated_at DESC')
      .all() as Record<string, unknown>[];
    return rows.map((row) => enrichAuctionRow(deps.db, row));
  });

  ipcMain.handle('auction:delete', (_e, id: string) => {
    deleteAuction(deps.db, id);
    deps.scheduler.refreshItem(id);
  });

  ipcMain.handle('auction:set-auto-order', (_e, id: string, enabled: boolean) => {
    deps.db
      .prepare('UPDATE auction_list SET auto_order_enabled = ? WHERE id = ?')
      .run(enabled ? 1 : 0, id);
    deps.scheduler.refreshItem(id);
    return deps.db.prepare('SELECT * FROM auction_list WHERE id = ?').get(id);
  });

  ipcMain.handle('auction:update-target-price', (_e, id: string, price: number | null) => {
    deps.db
      .prepare('UPDATE auction_list SET target_price = ? WHERE id = ?')
      .run(price, id);
    deps.scheduler.refreshItem(id);
    return deps.db.prepare('SELECT * FROM auction_list WHERE id = ?').get(id);
  });

  /** 更新自动出价提前量（距结束 ms，min ≤ max） */
  ipcMain.handle(
    'auction:update-offer-advance',
    (_e, id: string, minMs: number, maxMs: number) => {
      const min = Math.max(0, Math.round(minMs));
      const max = Math.max(min, Math.round(maxMs));
      deps.db
        .prepare(
          'UPDATE auction_list SET offer_advance_min_ms = ?, offer_advance_max_ms = ? WHERE id = ?',
        )
        .run(min, max, id);
      deps.scheduler.refreshItem(id);
      return deps.db.prepare('SELECT * FROM auction_list WHERE id = ?').get(id);
    },
  );

  /** 拉取商品抢购历史（dbd.auction.detail.history） */
  ipcMain.handle('auction:get-history', async (_e, auctionId: string) => {
    const row = deps.db
      .prepare('SELECT used_no FROM auction_list WHERE id = ?')
      .get(auctionId) as { used_no: string | null } | undefined;

    let usedNo = row?.used_no ?? null;
    if (!usedNo) {
      const snap = getLatestDetailSnapshot(deps.db, auctionId);
      if (snap) {
        try {
          usedNo = parseUsedNo(JSON.parse(snap.detail_json) as unknown);
          if (usedNo) {
            deps.db.prepare('UPDATE auction_list SET used_no = ? WHERE id = ?').run(usedNo, auctionId);
          }
        } catch {
          // 快照解析失败
        }
      }
    }

    if (!usedNo) {
      throw new Error('缺少 usedNo，请在详情页重新加入抢单列表');
    }

    const json = await deps.jdApi.call(
      JD_FUNCTIONS.AUCTION_HISTORY,
      buildAuctionHistoryBody(usedNo),
    );
    assertJdApiOk(json, 'dbd.auction.detail.history');
    return parseAuctionHistoryResponse(json) as AuctionHistoryItem[];
  });

  /** 获取出价记录（本地快照，可选 refresh 拉取最新） */
  ipcMain.handle(
    'auction:get-bid-records',
    async (_e, auctionId: string, refresh = false) => {
      const row = deps.db
        .prepare('SELECT address FROM auction_list WHERE id = ?')
        .get(auctionId) as { address: string | null } | undefined;

      if (refresh) {
        if (!row?.address) {
          throw new Error('缺少区域 address，无法拉取出价记录');
        }
        const json = await deps.jdApi.call(
          JD_FUNCTIONS.BID_RECORDS,
          buildBidRecordsBody(auctionId, row.address),
        );
        insertBidRecordsSnapshot(deps.db, auctionId, json);
        deps.notifyListUpdated();
      }

      const snap = getLatestBidRecordsSnapshot(deps.db, auctionId);
      if (!snap) {
        return { fetchedAt: null, records: [] };
      }
      const records = parseBidRecordsResponse(JSON.parse(snap.records_json) as unknown);
      return { fetchedAt: snap.fetched_at, records };
    },
  );
}
