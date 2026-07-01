import { describe, expect, it } from 'vitest';
import {
  calcOfferFireAt,
  calcOfferScheduleDelay,
  DEFAULT_OFFER_ADVANCE_MAX_MS,
  DEFAULT_OFFER_ADVANCE_MIN_MS,
  pickOfferAdvanceMs,
} from '../src/shared/offer-schedule';

describe('offer-schedule', () => {
  it('默认提前量为 150–250ms', () => {
    expect(DEFAULT_OFFER_ADVANCE_MIN_MS).toBe(150);
    expect(DEFAULT_OFFER_ADVANCE_MAX_MS).toBe(250);
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

  it('计入预估 RTT 后 fireAt 更早', () => {
    expect(
      calcOfferFireAt({
        auctionEndTime: 10_000,
        advanceMs: 150,
        estimatedOfferRttMs: 80,
      }),
    ).toBe(9770);
    expect(
      calcOfferScheduleDelay({
        auctionEndTime: 10_000,
        serverNowMs: 9_800,
        advanceMs: 150,
        estimatedOfferRttMs: 80,
      }),
    ).toBe(0);
  });

  it('pickOfferAdvanceMs 支持颠倒的 min/max', () => {
    const v = pickOfferAdvanceMs(250, 150);
    expect(v).toBeGreaterThanOrEqual(150);
    expect(v).toBeLessThanOrEqual(250);
  });
});
