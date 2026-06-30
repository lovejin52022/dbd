import { describe, expect, it } from 'vitest';
import { resolveLifecycleStatus, canPollBidAndStatus } from '../src/shared/lifecycle';

describe('lifecycle', () => {
  it('未开始', () => {
    expect(resolveLifecycleStatus({ nowMs: 1000, startTimeMs: 5000, endTimeMs: 10000 }))
      .toBe('not_started');
  });
  it('抢购中', () => {
    expect(resolveLifecycleStatus({ nowMs: 6000, startTimeMs: 5000, endTimeMs: 10000 }))
      .toBe('in_progress');
  });
  it('已过期', () => {
    expect(resolveLifecycleStatus({ nowMs: 11000, startTimeMs: 5000, endTimeMs: 10000 }))
      .toBe('expired');
  });
  it('仅抢购中可轮询', () => {
    expect(canPollBidAndStatus('in_progress')).toBe(true);
    expect(canPollBidAndStatus('not_started')).toBe(false);
  });
});
