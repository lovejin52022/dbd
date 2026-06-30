import { resolveLifecycleStatus } from '../../shared/lifecycle';
import type { LifecycleStatus } from '../../shared/types';
import type { AuctionListDbRow } from '../electron.d.ts';

/** 生命周期中文 */
export const LIFECYCLE_LABELS: Record<LifecycleStatus, string> = {
  not_started: '未开始',
  in_progress: '抢购中',
  expired: '已过期',
};

/** 计算展示用生命周期 */
export function getDisplayLifecycle(item: AuctionListDbRow, nowMs: number): LifecycleStatus {
  const startMs = item.detail_display?.startTime ?? item.auction_start_time;
  const endMs = item.auction_end_time ?? item.detail_display?.actualEndTime;
  if (startMs == null && endMs == null) {
    return item.lifecycle_status as LifecycleStatus;
  }
  return resolveLifecycleStatus({ nowMs, startTimeMs: startMs, endTimeMs: endMs });
}

/** 商品展示名 */
export function getDisplayName(item: AuctionListDbRow): string {
  return item.detail_display?.productName || item.title || item.id;
}
