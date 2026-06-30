import type Database from 'better-sqlite3';

export interface BidRecordsSummary {
  count: number;
  lastFetchedAt: string | null;
}

/** 出价记录拉取次数与最近时间 */
export function getBidRecordsSummary(db: Database.Database, auctionId: string): BidRecordsSummary {
  const row = db
    .prepare(`
      SELECT COUNT(*) AS count, MAX(fetched_at) AS last_fetched_at
      FROM bid_records WHERE auction_id = ?
    `)
    .get(auctionId) as { count: number; last_fetched_at: string | null };
  return {
    count: row?.count ?? 0,
    lastFetchedAt: row?.last_fetched_at ?? null,
  };
}

/** 写入出价记录快照 */
export function insertBidRecordsSnapshot(
  db: Database.Database,
  auctionId: string,
  recordsJson: unknown,
): void {
  db.prepare(`
    INSERT INTO bid_records (auction_id, fetched_at, records_json)
    VALUES (?, ?, ?)
  `).run(auctionId, new Date().toISOString(), JSON.stringify(recordsJson));
}

export interface BidRecordsSnapshotRow {
  id: number;
  auction_id: string;
  fetched_at: string;
  records_json: string;
}

/** 获取某商品最新一条出价记录快照 */
export function getLatestBidRecordsSnapshot(
  db: Database.Database,
  auctionId: string,
): BidRecordsSnapshotRow | undefined {
  return db
    .prepare(`
      SELECT * FROM bid_records
      WHERE auction_id = ?
      ORDER BY id DESC
      LIMIT 1
    `)
    .get(auctionId) as BidRecordsSnapshotRow | undefined;
}
