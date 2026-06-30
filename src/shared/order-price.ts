/**
 * 计算 offerPrice 请求的 price 字段。
 * 未设期望价时在当前价基础上 +1；未超期望价则出期望价；已超则再 +1。
 */
export function calcOfferPrice(
  currentPrice: number,
  targetPrice: number | null | undefined,
): number {
  if (targetPrice == null || Number.isNaN(targetPrice)) {
    return currentPrice + 1;
  }
  if (currentPrice <= targetPrice) {
    return targetPrice;
  }
  return currentPrice + 1;
}
