import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { ClockSync } from '../src/main/scheduler/clock-sync';
import { scheduleOfferPrice } from '../src/main/scheduler/item-runner';
import {
  calcOfferScheduleDelay,
  pickOfferAdvanceMs,
} from '../src/shared/offer-schedule';

describe('calcOfferScheduleDelay', () => {
  it('fireAt = endTime - advanceMs，delay = max(0, fireAt - serverNow)', () => {
    const endTime = 1_000_000;
    const serverNow = 999_850;
    const advanceMs = 90;
    // fireAt = 999910, delay = 60
    expect(
      calcOfferScheduleDelay({ auctionEndTime: endTime, serverNowMs: serverNow, advanceMs }),
    ).toBe(60);
  });

  it('已过触发时刻则 delay 为 0', () => {
    expect(
      calcOfferScheduleDelay({
        auctionEndTime: 1_000_000,
        serverNowMs: 999_999,
        advanceMs: 80,
      }),
    ).toBe(0);
  });
});

describe('pickOfferAdvanceMs', () => {
  it('min=max 时返回固定值', () => {
    expect(pickOfferAdvanceMs(150, 150)).toBe(150);
  });

  it('在 [min,max] 范围内', () => {
    for (let i = 0; i < 20; i++) {
      const v = pickOfferAdvanceMs(100, 200);
      expect(v).toBeGreaterThanOrEqual(100);
      expect(v).toBeLessThanOrEqual(200);
    }
  });
});

describe('scheduleOfferPrice', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0); // advanceMs = min = 100
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('按校准后服务器时间在结束前 advanceMs 触发', () => {
    const clock = new ClockSync();
    vi.setSystemTime(1000);
    clock.addSample(1050);

    const endTime = 5000;
    const onFire = vi.fn();

    scheduleOfferPrice({
      auctionEndTime: endTime,
      advanceMinMs: 100,
      advanceMaxMs: 200,
      clock,
      onFire,
    });

    const expectedDelay = calcOfferScheduleDelay({
      auctionEndTime: endTime,
      serverNowMs: clock.serverNow(),
      advanceMs: 100,
    });
    expect(expectedDelay).toBe(3850);

    vi.advanceTimersByTime(expectedDelay - 1);
    expect(onFire).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onFire).toHaveBeenCalledOnce();
  });
});
