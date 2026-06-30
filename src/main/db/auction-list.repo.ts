import type Database from 'better-sqlite3';
import type { AuctionListRow, LifecycleStatus } from '../../shared/types';

/** 按商品页 id 插入或更新抢单列表条目 */
export function upsertAuctionList(
  db: Database.Database,
  row: Partial<AuctionListRow> & { id: string; url: string },
): void {
  const now = new Date().toISOString();
  const existing = db.prepare('SELECT id FROM auction_list WHERE id = ?').get(row.id);
  if (existing) {
    db.prepare(`
      UPDATE auction_list SET
        skuid = COALESCE(@skuid, skuid),
        title = COALESCE(@title, title),
        url = @url,
        updated_at = @updatedAt,
        note = COALESCE(@note, note),
        target_price = COALESCE(@targetPrice, target_price),
        lifecycle_status = COALESCE(@lifecycleStatus, lifecycle_status),
        auction_start_time = COALESCE(@auctionStartTime, auction_start_time),
        auction_end_time = COALESCE(@auctionEndTime, auction_end_time),
        address = COALESCE(@address, address),
        data_incomplete = COALESCE(@dataIncomplete, data_incomplete)
      WHERE id = @id
    `).run({
      id: row.id,
      skuid: row.skuid ?? null,
      title: row.title ?? null,
      url: row.url,
      updatedAt: now,
      note: row.note ?? null,
      targetPrice: row.targetPrice ?? null,
      lifecycleStatus: row.lifecycleStatus ?? null,
      auctionStartTime: row.auctionStartTime ?? null,
      auctionEndTime: row.auctionEndTime ?? null,
      address: row.address ?? null,
      dataIncomplete: row.dataIncomplete ?? null,
    });
  } else {
    db.prepare(`
      INSERT INTO auction_list (
        id, skuid, title, url, added_at, updated_at, lifecycle_status, scheduler_phase
      ) VALUES (
        @id, @skuid, @title, @url, @addedAt, @updatedAt, @lifecycleStatus, 'idle'
      )
    `).run({
      id: row.id,
      skuid: row.skuid ?? null,
      title: row.title ?? '',
      url: row.url,
      addedAt: now,
      updatedAt: now,
      lifecycleStatus: row.lifecycleStatus ?? 'not_started',
    });
  }
}

/** 按生命周期状态查询列表（DB 列为 snake_case） */
export function listByLifecycle(db: Database.Database, status: LifecycleStatus): AuctionListRow[] {
  return db.prepare(`
    SELECT * FROM auction_list WHERE lifecycle_status = ?
  `).all(status) as AuctionListRow[];
}

/** 删除抢单条目，关联快照由外键级联删除 */
export function deleteAuction(db: Database.Database, id: string): void {
  db.prepare('DELETE FROM auction_list WHERE id = ?').run(id);
}
