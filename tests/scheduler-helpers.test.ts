import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { ClockSync, DEFAULT_ESTIMATED_RTT_MS } from '../src/main/scheduler/clock-sync';
import { scheduleOfferPrice } from '../src/main/scheduler/item-runner';
import {
  calcOfferFireAt,
  calcOfferScheduleDelay,
  pickOfferAdvanceMs,
} from '../src/shared/offer-schedule';

describe('calcOfferScheduleDelay', () => {
  it('fireAt = endTime - advanceMs - offerRtt，delay = max(0, fireAt - serverNow)', () => {
    const endTime = 1_000_000;
    const serverNow = 999_850;
    const advanceMs = 90;
    // fireAt = 999910 - 80 = 999830, delay = 0（serverNow 已超过 fireAt）
    expect(
      calcOfferScheduleDelay({
        auctionEndTime: endTime,
        serverNowMs: serverNow,
        advanceMs,
        estimatedOfferRttMs: 80,
      }),
    ).toBe(0);
  });

  it('无 RTT 补偿时 delay 按 advanceMs 计算', () => {
    expect(
      calcOfferScheduleDelay({
        auctionEndTime: 1_000_000,
        serverNowMs: 999_850,
        advanceMs: 90,
      }),
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
      const v = pickOfferAdvanceMs(150, 250);
      expect(v).toBeGreaterThanOrEqual(150);
      expect(v).toBeLessThanOrEqual(250);
    }
  });
});

describe('scheduleOfferPrice', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.spyOn(Math, 'random').mockReturnValue(0); // advanceMs = min = 150
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('按 fireAt 触发（含 RTT 补偿 + 末段细粒度对齐）', () => {
    const clock = new ClockSync();
    vi.setSystemTime(1000);
    clock.addSample(1050);

    const endTime = 5000;
    const onFire = vi.fn();

    scheduleOfferPrice({
      auctionEndTime: endTime,
      advanceMinMs: 150,
      advanceMaxMs: 250,
      clock,
      onFire,
    });

    const fireAt = calcOfferFireAt({
      auctionEndTime: endTime,
      advanceMs: 150,
      estimatedOfferRttMs: DEFAULT_ESTIMATED_RTT_MS,
    });
    expect(fireAt).toBe(5000 - 150 - DEFAULT_ESTIMATED_RTT_MS);

    const coarseDelay = Math.max(0, fireAt - clock.serverNow() - 20);
    vi.advanceTimersByTime(coarseDelay - 1);
    expect(onFire).not.toHaveBeenCalled();

    // 末段细粒度等待（最多 10ms 步进）
    vi.advanceTimersByTime(50);
    expect(onFire).toHaveBeenCalledOnce();
  });
});
