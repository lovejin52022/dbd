import { describe, expect, it } from 'vitest';
import { createTestDb } from '../src/main/db/connection';
import { upsertAuctionList, deleteAuction } from '../src/main/db/auction-list.repo';

describe('auction_list repo', () => {
  it('upsert 使用商品页 id 作为主键', () => {
    const db = createTestDb();
    upsertAuctionList(db, { id: '404150571', url: 'https://example.com', title: '测试' });
    upsertAuctionList(db, { id: '404150571', url: 'https://example.com/v2', title: '更新' });
    const row = db.prepare('SELECT title, url FROM auction_list WHERE id = ?').get('404150571') as {
      title: string;
      url: string;
    };
    expect(row.title).toBe('更新');
    deleteAuction(db, '404150571');
    expect(db.prepare('SELECT id FROM auction_list').all()).toHaveLength(0);
  });
});
