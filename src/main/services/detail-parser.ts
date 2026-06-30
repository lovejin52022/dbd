export interface ParsedDetail {
  title: string;
  auctionStartTime: number | null;
  auctionEndTime: number | null;
  platformStatusExpired: boolean;
}

export interface ParsedSaleInfo {
  address: string | null;
}

/** 从 detail.v2 响应提取时间与标题；路径按真实 API 微调 */
export function parseDetailResponse(json: unknown): ParsedDetail {
  const root = json as Record<string, unknown>;
  const data = (root.result as Record<string, unknown>)?.data
    ?? (root.data as Record<string, unknown>)
    ?? root;
  const d = data as Record<string, unknown>;
  const start = d.startTime ?? d.auctionStartTime ?? d.beginTime;
  const end = d.endTime ?? d.auctionEndTime ?? d.finishTime;
  const status = d.status ?? d.auctionStatus;
  return {
    title: String(d.title ?? d.productName ?? ''),
    auctionStartTime: start != null ? Number(start) : null,
    auctionEndTime: end != null ? Number(end) : null,
    platformStatusExpired: status === 4 || status === 'ended' || d.expired === true,
  };
}

export function parseSaleInfoResponse(json: unknown): ParsedSaleInfo {
  const root = json as Record<string, unknown>;
  const data = (root.result as Record<string, unknown>)?.data ?? root;
  const d = data as Record<string, unknown>;
  const address = d.address ?? d.area ?? d.areaId;
  return { address: address != null ? String(address) : null };
}

/** 从 get_current_and_offerNum 提取当前价与服务器时间 */
export function parseStatusResponse(json: unknown, auctionId: string): {
  currentPrice: number | null;
  bidCount: number | null;
  auctionStatus: number | null;
  serverTimeMs: number | null;
  platformStatusExpired: boolean;
} {
  const root = json as Record<string, unknown>;
  const data = (root.result as Record<string, unknown>)?.data ?? root;
  const item = (data as Record<string, unknown>)[auctionId] ?? data;
  const d = item as Record<string, unknown>;
  return {
    currentPrice: d.currentPrice != null ? Number(d.currentPrice) : null,
    bidCount: d.num != null ? Number(d.num) : null,
    auctionStatus: d.status != null ? Number(d.status) : null,
    serverTimeMs: d.serverTime != null ? Number(d.serverTime) : null,
    platformStatusExpired: d.status === 4,
  };
}
