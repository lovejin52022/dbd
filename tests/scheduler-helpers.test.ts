import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { ClockSync } from '../src/main/scheduler/clock-sync';
import {
  calcOfferScheduleDelay,
  scheduleOfferPrice,
} from '../src/main/scheduler/item-runner';

describe('calcOfferScheduleDelay', () => {
  it('fireAt = startTime - advanceMs，delay = max(0, fireAt - serverNow)', () => {
    const startTime = 1_000_000;
    const serverNow = 999_850;
    const advanceMs = 90;
    // fireAt = 999910, delay = 60
    expect(
      calcOfferScheduleDelay({ auctionStartTime: startTime, serverNowMs: serverNow, advanceMs }),
    ).toBe(60);
  });

  it('已过触发时刻则 delay 为 0', () => {
    expect(
      calcOfferScheduleDelay({
        auctionStartTime: 1_000_000,
        serverNowMs: 999_999,
        advanceMs: 80,
      }),
    ).toBe(0);
  });
});

describe('scheduleOfferPrice', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0); // advanceMs = 80
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('按校准后服务器时间计算 setTimeout 延迟', () => {
    const clock = new ClockSync();
    // 本地 1000，服务器 1050 → offset +50
    vi.setSystemTime(1000);
    clock.addSample(1050);

    const startTime = 5000;
    const onFire = vi.fn();

    scheduleOfferPrice({ auctionStartTime: startTime, clock, onFire });

    // serverNow = 1050, fireAt = 4920, delay = 3870
    const expectedDelay = calcOfferScheduleDelay({
      auctionStartTime: startTime,
      serverNowMs: clock.serverNow(),
      advanceMs: 80,
    });
    expect(expectedDelay).toBe(3870);

    vi.advanceTimersByTime(expectedDelay - 1);
    expect(onFire).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onFire).toHaveBeenCalledOnce();
  });
});
