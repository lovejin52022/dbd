import Database from 'better-sqlite3';
import { join } from 'path';
import { migrate } from './migrate';

let db: Database.Database | null = null;

/** 主进程单例：用户数据目录下的 SQLite 文件 */
export function getDb(): Database.Database {
  if (!db) {
    // 运行时加载 electron，避免测试环境解析 electron 包
    const { app } = require('electron') as typeof import('electron');
    const path = join(app.getPath('userData'), 'duobaodao.db');
    db = new Database(path);
    db.pragma('foreign_keys = ON');
    migrate(db);
  }
  return db;
}

/** 测试专用：内存库，不依赖 Electron app */
export function createTestDb(): Database.Database {
  const testDb = new Database(':memory:');
  testDb.pragma('foreign_keys = ON');
  migrate(testDb);
  return testDb;
}
