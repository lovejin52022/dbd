import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createTestDb } from '../../src/main/db/connection';
import { listActiveForStatusPoll, listByLifecycle, upsertAuctionList } from '../../src/main/db/auction-list.repo';
import { AuctionScheduler } from '../../src/main/scheduler/auction-scheduler';
import { resolveLifecycleStatus } from '../../src/shared/lifecycle';
import type { JdApiService } from '../../src/main/services/jd-api.service';
import { JD_FUNCTIONS } from '../../src/shared/constants';

/** 构造 mock JdApiService */
function createMockJdApi(): JdApiService {
  return { call: vi.fn().mockResolvedValue({}) } as unknown as JdApiService;
}

describe('慢轮询查询过滤', () => {
  it('not_started 与 in_progress 均纳入定时状态同步', () => {
    const db = createTestDb();
    upsertAuctionList(db, { id: 'ns-1', url: 'https://example.com/a', lifecycleStatus: 'not_started' });
    upsertAuctionList(db, { id: 'ip-1', url: 'https://example.com/b', lifecycleStatus: 'in_progress' });
    upsertAuctionList(db, { id: 'ex-1', url: 'https://example.com/c', lifecycleStatus: 'expired' });
    db.prepare('UPDATE auction_list SET data_incomplete = 0').run();

    const pollIds = listActiveForStatusPoll(db).map((r) => r.id);

    expect(pollIds).toEqual(expect.arrayContaining(['ns-1', 'ip-1']));
    expect(pollIds).not.toContain('ex-1');
  });

  it('not_started 条目不在 listByLifecycle(in_progress) 结果中', () => {
    const db = createTestDb();
    upsertAuctionList(db, { id: 'ns-1', url: 'https://example.com/a', lifecycleStatus: 'not_started' });
    upsertAuctionList(db, { id: 'ip-1', url: 'https://example.com/b', lifecycleStatus: 'in_progress' });
    upsertAuctionList(db, { id: 'ex-1', url: 'https://example.com/c', lifecycleStatus: 'expired' });

    const slowPollIds = listByLifecycle(db, 'in_progress').map((r) => r.id);

    expect(slowPollIds).toEqual(['ip-1']);
    expect(slowPollIds).not.toContain('ns-1');
    expect(slowPollIds).not.toContain('ex-1');
  });
});

describe('生命周期 not_started → in_progress', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('resolveLifecycleStatus 随时间推进从 not_started 转为 in_progress', () => {
    const startTimeMs = 5_000;
    const endTimeMs = 10_000;

    expect(
      resolveLifecycleStatus({ nowMs: 1_000, startTimeMs, endTimeMs }),
    ).toBe('not_started');
    expect(
      resolveLifecycleStatus({ nowMs: 4_999, startTimeMs, endTimeMs }),
    ).toBe('not_started');
    expect(
      resolveLifecycleStatus({ nowMs: 5_000, startTimeMs, endTimeMs }),
    ).toBe('in_progress');
  });

  it('ItemRunner 到开始时间后更新 DB 并纳入慢轮询范围', async () => {
    const db = createTestDb();
    const startTime = 6_000;
    vi.setSystemTime(0);
    upsertAuctionList(db, {
      id: 'auc-1',
      url: 'https://example.com',
      lifecycleStatus: 'not_started',
    });
    db.prepare(
      'UPDATE auction_list SET auction_start_time = ?, data_incomplete = 0 WHERE id = ?',
    ).run(startTime, 'auc-1');

    const jdApi = createMockJdApi();
    const scheduler = new AuctionScheduler(db, jdApi, vi.fn());
    scheduler.start();

    // 距开始还差 1ms 时仍为 not_started
    vi.advanceTimersByTime(startTime - 1);
    expect(listByLifecycle(db, 'in_progress')).toHaveLength(0);

    vi.advanceTimersByTime(1);
    expect(
      (db.prepare('SELECT lifecycle_status FROM auction_list WHERE id = ?').get('auc-1') as {
        lifecycle_status: string;
      }).lifecycle_status,
    ).toBe('in_progress');
    expect(listByLifecycle(db, 'in_progress').map((r) => r.id)).toEqual(['auc-1']);

    scheduler.stop();
  });
});

describe('过期拉取出价记录', () => {
  it('fetchBidRecordsOnce 调用 bidrecords 并标记 expired', async () => {
    const db = createTestDb();
    upsertAuctionList(db, { id: 'exp-1', url: 'https://example.com', lifecycleStatus: 'in_progress' });
    db.prepare('UPDATE auction_list SET address = ? WHERE id = ?').run('test-address', 'exp-1');

    const jdApi = createMockJdApi();
    const scheduler = new AuctionScheduler(db, jdApi, vi.fn());

    await scheduler.fetchBidRecordsOnce('exp-1');

    expect(jdApi.call).toHaveBeenCalledOnce();
    expect(jdApi.call).toHaveBeenCalledWith(
      JD_FUNCTIONS.BID_RECORDS,
      expect.objectContaining({ auctionId: 'exp-1' }),
    );

    const row = db
      .prepare('SELECT lifecycle_status, scheduler_phase FROM auction_list WHERE id = ?')
      .get('exp-1') as { lifecycle_status: string; scheduler_phase: string };
    expect(row.lifecycle_status).toBe('expired');
    expect(row.scheduler_phase).toBe('done');
  });
});
