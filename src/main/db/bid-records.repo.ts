import type Database from 'better-sqlite3';

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
