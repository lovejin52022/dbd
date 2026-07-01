/** 距结束快轮询窗口（毫秒） */
export const FAST_POLL_BEFORE_END_MS = 10_000;

/** 默认：结束前 150–250ms 随机出价（另加预估 RTT 补偿） */
export const DEFAULT_OFFER_ADVANCE_MIN_MS = 250;
export const DEFAULT_OFFER_ADVANCE_MAX_MS = 350;

/** 在 [min, max] 内随机选取提前毫秒数 */
export function pickOfferAdvanceMs(minMs: number, maxMs: number): number {
  const min = Math.min(minMs, maxMs);
  const max = Math.max(minMs, maxMs);
  if (min === max) return min;
  return min + Math.floor(Math.random() * (max - min + 1));
}

/** 目标触发时刻 = endTime - advanceMs - estimatedOfferRttMs */
export function calcOfferFireAt(params: {
  auctionEndTime: number;
  advanceMs: number;
  estimatedOfferRttMs?: number;
}): number {
  const offerRtt = params.estimatedOfferRttMs ?? 0;
  return params.auctionEndTime - params.advanceMs - offerRtt;
}

/** fireAt = endTime - advanceMs - offerRtt，delay = max(0, fireAt - serverNow) */
export function calcOfferScheduleDelay(params: {
  auctionEndTime: number;
  serverNowMs: number;
  advanceMs: number;
  estimatedOfferRttMs?: number;
}): number {
  const fireAt = calcOfferFireAt({
    auctionEndTime: params.auctionEndTime,
    advanceMs: params.advanceMs,
    estimatedOfferRttMs: params.estimatedOfferRttMs,
  });
  return Math.max(0, fireAt - params.serverNowMs);
}
