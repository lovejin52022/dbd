import { describe, expect, it } from 'vitest';
import {
  calcOfferScheduleDelay,
  DEFAULT_OFFER_ADVANCE_MAX_MS,
  DEFAULT_OFFER_ADVANCE_MIN_MS,
  pickOfferAdvanceMs,
} from '../src/shared/offer-schedule';

describe('offer-schedule', () => {
  it('默认提前量为 100–200ms', () => {
    expect(DEFAULT_OFFER_ADVANCE_MIN_MS).toBe(100);
    expect(DEFAULT_OFFER_ADVANCE_MAX_MS).toBe(200);
  });

  it('结束前 150ms 触发', () => {
    expect(
      calcOfferScheduleDelay({
        auctionEndTime: 10_000,
        serverNowMs: 9_800,
        advanceMs: 150,
      }),
    ).toBe(50);
  });

  it('pickOfferAdvanceMs 支持颠倒的 min/max', () => {
    const v = pickOfferAdvanceMs(200, 100);
    expect(v).toBeGreaterThanOrEqual(100);
    expect(v).toBeLessThanOrEqual(200);
  });
});
