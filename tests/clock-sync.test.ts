import { describe, expect, it, vi } from 'vitest';
import { ClockSync, DEFAULT_ESTIMATED_RTT_MS } from '../src/main/scheduler/clock-sync';

describe('ClockSync', () => {
  it('无样本时 serverNow 回退到 Date.now', () => {
    const clock = new ClockSync();
    const before = Date.now();
    expect(clock.serverNow()).toBeGreaterThanOrEqual(before);
    expect(clock.getEstimatedRttMs()).toBe(DEFAULT_ESTIMATED_RTT_MS);
  });

  it('无 timing 时按收到时刻建立锚点', () => {
    vi.useFakeTimers();
    vi.setSystemTime(2000);
    const clock = new ClockSync();
    clock.addSample(2000);
    expect(clock.getOffset()).toBe(0);
    expect(clock.serverNow()).toBe(2000);
    vi.useRealTimers();
  });

  it('RTT/2 补偿使 serverNow 更接近真实服务器时间', () => {
    const clock = new ClockSync();
    clock.addSample(1000, {
      requestSentAtMs: 900,
      responseReceivedAtMs: 1000,
    });
    // serverTime=1000, rtt=100 → estimated=1050
    expect(clock.serverNow()).toBeGreaterThanOrEqual(1045);
    expect(clock.getEstimatedRttMs()).toBe(100);
  });

  it('recordRtt 滑动平均', () => {
    const clock = new ClockSync();
    clock.recordRtt(80);
    clock.recordRtt(120);
    expect(clock.getEstimatedRttMs()).toBe(100);
  });

  it('过高 RTT 样本被忽略', () => {
    const clock = new ClockSync();
    clock.recordRtt(600);
    expect(clock.getEstimatedRttMs()).toBe(DEFAULT_ESTIMATED_RTT_MS);
  });
});
