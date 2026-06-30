/** 距结束快轮询窗口（毫秒） */
export const FAST_POLL_BEFORE_END_MS = 10_000;

/** 默认：结束前 100–200ms 随机出价 */
export const DEFAULT_OFFER_ADVANCE_MIN_MS = 100;
export const DEFAULT_OFFER_ADVANCE_MAX_MS = 200;

/** 在 [min, max] 内随机选取提前毫秒数 */
export function pickOfferAdvanceMs(minMs: number, maxMs: number): number {
  const min = Math.min(minMs, maxMs);
  const max = Math.max(minMs, maxMs);
  if (min === max) return min;
  return min + Math.floor(Math.random() * (max - min + 1));
}

/** fireAt = endTime - advanceMs，delay = max(0, fireAt - serverNow) */
export function calcOfferScheduleDelay(params: {
  auctionEndTime: number;
  serverNowMs: number;
  advanceMs: number;
}): number {
  const fireAt = params.auctionEndTime - params.advanceMs;
  return Math.max(0, fireAt - params.serverNowMs);
}
