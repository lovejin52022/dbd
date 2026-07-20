/**
 * 计算 offerPrice 请求的 price 字段。
 * 未设期望价时在当前价基础上 +1；未超期望价则出期望价；
 * 已超期望价则返回 null（表示不抢购）。
 */
export function calcOfferPrice(
  currentPrice: number,
  targetPrice: number | null | undefined,
): number | null {
  if (targetPrice == null || Number.isNaN(targetPrice)) {
    return currentPrice + 1;
  }
  // 当前价已超过期望价：放弃抢购
  if (currentPrice > targetPrice) {
    return null;
  }
  return targetPrice;
}
