import type { LifecycleStatus } from './types';

export interface LifecycleInput {
  nowMs: number;
  startTimeMs: number | null;
  endTimeMs: number | null;
  /** 平台侧已标记过期时优先判定为 expired */
  platformStatusExpired?: boolean;
}

/** 按 spec 优先级判定生命周期：平台过期 > 结束时间 > 开始时间 */
export function resolveLifecycleStatus(input: LifecycleInput): LifecycleStatus {
  if (input.platformStatusExpired) return 'expired';
  if (input.endTimeMs != null && input.nowMs >= input.endTimeMs) return 'expired';
  if (input.startTimeMs != null && input.nowMs >= input.startTimeMs) return 'in_progress';
  return 'not_started';
}

/** 仅抢购中需要轮询出价与状态 */
export function canPollBidAndStatus(status: LifecycleStatus): boolean {
  return status === 'in_progress';
}

/** 仅抢购中允许开启自动出价 */
export function canEnableAutoOrder(status: LifecycleStatus): boolean {
  return status === 'in_progress';
}
