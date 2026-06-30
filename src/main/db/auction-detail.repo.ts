import type Database from 'better-sqlite3';

/** 写入 detail.v2 / saleInfo 快照 */
export function insertDetailSnapshot(
  db: Database.Database,
  auctionId: string,
  detailJson: unknown,
  saleInfoJson: unknown,
): void {
  db.prepare(`
    INSERT INTO auction_detail (auction_id, fetched_at, detail_json, sale_info_json)
    VALUES (?, ?, ?, ?)
  `).run(auctionId, new Date().toISOString(), JSON.stringify(detailJson), JSON.stringify(saleInfoJson));
}
