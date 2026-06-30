import type Database from 'better-sqlite3';

export interface DetailSnapshotRow {
  id: number;
  auction_id: string;
  fetched_at: string;
  detail_json: string;
  sale_info_json: string;
}

/** 获取某商品最新一条详情快照 */
export function getLatestDetailSnapshot(
  db: Database.Database,
  auctionId: string,
): DetailSnapshotRow | undefined {
  return db
    .prepare(`
      SELECT * FROM auction_detail
      WHERE auction_id = ?
      ORDER BY id DESC
      LIMIT 1
    `)
    .get(auctionId) as DetailSnapshotRow | undefined;
}

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
