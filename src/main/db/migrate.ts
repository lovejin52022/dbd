import type Database from 'better-sqlite3';

/** 创建抢单列表、详情快照、出价记录三张表 */
export function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS auction_list (
      id TEXT PRIMARY KEY,
      skuid TEXT,
      title TEXT NOT NULL DEFAULT '',
      url TEXT NOT NULL,
      added_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      note TEXT,
      target_price REAL,
      auto_order_enabled INTEGER NOT NULL DEFAULT 0,
      lifecycle_status TEXT NOT NULL DEFAULT 'not_started',
      auction_start_time INTEGER,
      auction_end_time INTEGER,
      address TEXT,
      current_price REAL,
      bid_count INTEGER,
      auction_status INTEGER,
      server_time_offset INTEGER NOT NULL DEFAULT 0,
      order_result TEXT NOT NULL DEFAULT 'pending',
      order_error TEXT,
      last_polled_at TEXT,
      scheduler_phase TEXT NOT NULL DEFAULT 'idle',
      data_incomplete INTEGER NOT NULL DEFAULT 0,
      used_no TEXT,
      current_bidder TEXT,
      offer_advance_min_ms INTEGER NOT NULL DEFAULT 100,
      offer_advance_max_ms INTEGER NOT NULL DEFAULT 200
    );
    CREATE TABLE IF NOT EXISTS auction_detail (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      auction_id TEXT NOT NULL,
      fetched_at TEXT NOT NULL,
      detail_json TEXT NOT NULL,
      sale_info_json TEXT NOT NULL,
      FOREIGN KEY (auction_id) REFERENCES auction_list(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS bid_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      auction_id TEXT NOT NULL,
      fetched_at TEXT NOT NULL,
      records_json TEXT NOT NULL,
      FOREIGN KEY (auction_id) REFERENCES auction_list(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_auction_detail_auction_id ON auction_detail(auction_id);
    CREATE INDEX IF NOT EXISTS idx_bid_records_auction_id ON bid_records(auction_id);
  `);

  // 兼容已有数据库：增量添加 used_no 列
  const cols = db.prepare('PRAGMA table_info(auction_list)').all() as { name: string }[];
  if (!cols.some((c) => c.name === 'used_no')) {
    db.exec('ALTER TABLE auction_list ADD COLUMN used_no TEXT');
  }
  if (!cols.some((c) => c.name === 'current_bidder')) {
    db.exec('ALTER TABLE auction_list ADD COLUMN current_bidder TEXT');
  }
  if (!cols.some((c) => c.name === 'offer_advance_min_ms')) {
    db.exec(
      'ALTER TABLE auction_list ADD COLUMN offer_advance_min_ms INTEGER NOT NULL DEFAULT 100',
    );
  }
  if (!cols.some((c) => c.name === 'offer_advance_max_ms')) {
    db.exec(
      'ALTER TABLE auction_list ADD COLUMN offer_advance_max_ms INTEGER NOT NULL DEFAULT 200',
    );
  }
}
