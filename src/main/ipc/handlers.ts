import { ipcMain } from 'electron';
import type Database from 'better-sqlite3';
import { ingestAuctionFromUrl } from '../services/auction-ingest.service';
import { deleteAuction } from '../db/auction-list.repo';
import type { JdApiService } from '../services/jd-api.service';

/** 注册抢单列表相关 IPC 处理器 */
export function registerIpcHandlers(deps: {
  db: Database.Database;
  jdApi: JdApiService;
}): void {
  ipcMain.handle('auction:add', async (_e, payload: {
    id: string; skuid: string | null; url: string; title: string;
  }) => {
    await ingestAuctionFromUrl(deps.db, deps.jdApi, payload);
    return deps.db.prepare('SELECT * FROM auction_list WHERE id = ?').get(payload.id);
  });

  ipcMain.handle('auction:list', () => {
    return deps.db.prepare('SELECT * FROM auction_list ORDER BY updated_at DESC').all();
  });

  ipcMain.handle('auction:delete', (_e, id: string) => {
    deleteAuction(deps.db, id);
  });
}
