export interface ParsedDetail {
  title: string;
  auctionStartTime: number | null;
  auctionEndTime: number | null;
  platformStatusExpired: boolean;
}

export interface ParsedSaleInfo {
  address: string | null;
  freightAreaText: string | null;
}

/** 侧栏展示用的 saleInfo 摘要 */
export interface SaleInfoDisplayInfo {
  freightArea: string | null;
  freightAreaText: string | null;
  stockCheckArea: string | null;
  hasAuctionStock: boolean | null;
}

/** 侧栏展示用的详情摘要 */
export interface DetailDisplayInfo {
  productName: string;
  imageUrl: string | null;
  startTime: number | null;
  actualEndTime: number | null;
  startPrice: number | null;
  qualityDesc: string | null;
}

/** 秒级时间戳转毫秒（10 位秒 / 13 位毫秒） */
export function normalizeTimeMs(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (Number.isNaN(n)) return null;
  if (n >= 1e12) return n;
  if (n >= 1e9) return n * 1000;
  return n;
}

function pickString(obj: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const v = obj[key];
    if (v != null && v !== '') return String(v);
  }
  return '';
}

function pickNumber(obj: Record<string, unknown>, ...keys: string[]): number | null {
  for (const key of keys) {
    const v = obj[key];
    if (v != null && v !== '') {
      const n = Number(v);
      if (!Number.isNaN(n)) return n;
    }
  }
  return null;
}

/** 归一化商品图 URL */
function normalizeImageUrl(raw: unknown): string | null {
  if (raw == null || raw === '') return null;
  const s = String(raw);
  if (s.startsWith('//')) return `https:${s}`;
  return s;
}

/** 从 detail 响应中取业务数据节点 */
function unwrapDetailData(json: unknown): Record<string, unknown> {
  const root = json as Record<string, unknown>;
  const data = (root.result as Record<string, unknown>)?.data
    ?? (root.data as Record<string, unknown>)
    ?? root;
  return data as Record<string, unknown>;
}

/** 详情里常见嵌套：auctionInfo / productInfo */
function mergeDetailNodes(data: Record<string, unknown>): Record<string, unknown> {
  const auctionInfo = (data.auctionInfo ?? data.auctionDetail ?? data.paimaiInfo ?? {}) as Record<string, unknown>;
  const productInfo = (data.productInfo ?? data.product ?? {}) as Record<string, unknown>;
  return { ...productInfo, ...auctionInfo, ...data };
}

/** 从 detail.v2 响应提取时间与标题 */
export function parseDetailResponse(json: unknown): ParsedDetail {
  const merged = mergeDetailNodes(unwrapDetailData(json));
  const start = merged.startTime ?? merged.auctionStartTime ?? merged.beginTime;
  // 抢购结束以 actualEndTime 为准
  const end = merged.actualEndTime ?? merged.endTime ?? merged.auctionEndTime ?? merged.finishTime;
  const status = merged.status ?? merged.auctionStatus;
  return {
    title: pickString(merged, 'title', 'productName', 'name', 'skuName'),
    auctionStartTime: normalizeTimeMs(start),
    auctionEndTime: normalizeTimeMs(end),
    platformStatusExpired: status === 4 || status === 'ended' || merged.expired === true,
  };
}

/** 侧栏展示：从最新 detail 快照解析 */
export function parseDetailDisplayInfo(json: unknown): DetailDisplayInfo {
  const merged = mergeDetailNodes(unwrapDetailData(json));
  const imageRaw =
    merged.image
    ?? merged.imageUrl
    ?? merged.mainImage
    ?? merged.imgUrl
    ?? merged.productImage;
  return {
    productName: pickString(merged, 'title', 'productName', 'name', 'skuName'),
    imageUrl: normalizeImageUrl(imageRaw),
    startTime: normalizeTimeMs(merged.startTime ?? merged.auctionStartTime),
    actualEndTime: normalizeTimeMs(
      merged.actualEndTime ?? merged.endTime ?? merged.auctionEndTime,
    ),
    startPrice: pickNumber(merged, 'startPrice', 'minPrice', 'initialPrice', 'cprice'),
    qualityDesc: pickString(merged, 'quality', 'qualityName', 'fineness', 'qualityDesc') || null,
  };
}

/** 区域 ID 格式：如 22-1930-49324-49399 */
function looksLikeAreaId(value: string): boolean {
  return /^\d+(?:-\d+)+$/.test(value);
}

/** 从省市区镇 ID 拼接 area（京东常见结构） */
function buildAreaIdFromParts(obj: Record<string, unknown>): string | null {
  const parts = [
    obj.provinceId ?? obj.province,
    obj.cityId ?? obj.city,
    obj.countyId ?? obj.county ?? obj.districtId,
    obj.townId ?? obj.town ?? obj.streetId,
  ];
  if (parts.some((p) => p == null || p === '')) return null;
  const ids = parts.map((p) => Number(p));
  if (ids.some((n) => Number.isNaN(n))) return null;
  return ids.join('-');
}

/** 从数组拼接 area，如 [22, 1930, 49324, 49399] */
function buildAreaIdFromArray(value: unknown): string | null {
  if (!Array.isArray(value) || value.length < 3) return null;
  const ids = value.slice(0, 4).map((v) => Number(v));
  if (ids.some((n) => Number.isNaN(n))) return null;
  while (ids.length < 4) ids.push(0);
  return ids.join('-');
}

/** 从任意 JSON 节点递归查找 address / area */
export function parseAddressFromJson(json: unknown): string | null {
  const found: string[] = [];

  function tryPush(raw: unknown): void {
    if (raw == null || raw === '') return;
    if (typeof raw === 'object') {
      const built =
        buildAreaIdFromParts(raw as Record<string, unknown>)
        ?? buildAreaIdFromArray(raw);
      if (built && looksLikeAreaId(built)) found.push(built);
      return;
    }
    const s = String(raw).trim();
    if (looksLikeAreaId(s)) found.push(s);
  }

  function walk(node: unknown, depth: number): void {
    if (depth > 6 || node == null || typeof node !== 'object') return;
    const obj = node as Record<string, unknown>;
    const fromParts = buildAreaIdFromParts(obj);
    if (fromParts && looksLikeAreaId(fromParts)) found.push(fromParts);
    for (const key of [
      'freightArea',
      'stockCheckArea',
      'address',
      'area',
      'areaId',
      'defaultAddress',
      'receiveArea',
      'areaCode',
      'fourLevelAddress',
      'userArea',
    ]) {
      tryPush(obj[key]);
    }
    for (const key of ['areaIdList', 'areaIds', 'areaList']) {
      tryPush(buildAreaIdFromArray(obj[key]));
    }
    for (const key of [
      'addressInfo',
      'userAddress',
      'saleInfo',
      'consigneeAddress',
      'deliveryAddress',
      'receiveAddress',
      'defaultConsigneeAddress',
      'data',
      'result',
      'auctionInfo',
    ]) {
      if (obj[key] != null) walk(obj[key], depth + 1);
    }
  }

  walk(json, 0);
  return found[0] ?? null;
}

/** 从 saleInfo 响应中取业务数据节点 */
function unwrapSaleInfoData(json: unknown): Record<string, unknown> {
  const root = json as Record<string, unknown>;
  const data = (root.result as Record<string, unknown>)?.data
    ?? (root.data as Record<string, unknown>)
    ?? root;
  return data as Record<string, unknown>;
}

export function parseSaleInfoResponse(json: unknown): ParsedSaleInfo {
  const d = unwrapSaleInfoData(json);
  // 多宝岛 saleInfo：区域 ID 在 freightArea / stockCheckArea
  const direct =
    d.freightArea
    ?? d.stockCheckArea
    ?? d.address
    ?? d.area
    ?? d.areaId
    ?? d.defaultAddress
    ?? d.receiveArea
    ?? d.fourLevelAddress;
  let address: string | null = null;
  if (direct != null && direct !== '') {
    if (typeof direct === 'object') {
      address = buildAreaIdFromParts(direct as Record<string, unknown>);
    } else {
      const s = String(direct).trim();
      address = looksLikeAreaId(s) ? s : null;
    }
  }
  if (!address) {
    address =
      buildAreaIdFromParts(d)
      ?? buildAreaIdFromArray(d.areaIdList ?? d.areaIds)
      ?? parseAddressFromJson(d)
      ?? parseAddressFromJson(json);
  }
  const freightAreaText = pickString(d, 'freightAreaText') || null;
  return { address, freightAreaText };
}

/** 侧栏展示：从 saleInfo 快照解析 */
export function parseSaleInfoDisplayInfo(json: unknown): SaleInfoDisplayInfo {
  const d = unwrapSaleInfoData(json);
  const parsed = parseSaleInfoResponse(json);
  const freightArea = pickString(d, 'freightArea') || parsed.address || null;
  const stockCheckArea = pickString(d, 'stockCheckArea') || null;
  const hasRaw = d.hasAuctionStock;
  return {
    freightArea,
    freightAreaText: parsed.freightAreaText,
    stockCheckArea: stockCheckArea || null,
    hasAuctionStock: typeof hasRaw === 'boolean' ? hasRaw : null,
  };
}

/** 从 get_current_and_offerNum 提取当前价与服务器时间 */
export function parseUsedNo(json: unknown): string | null {
  const merged = mergeDetailNodes(unwrapDetailData(json));
  const raw = merged.usedNo ?? merged.used_no ?? merged.goodsUsedNo ?? merged.usedGoodsNo;
  if (raw != null && raw !== '') return String(raw).trim();

  // 递归兜底查找
  function walk(node: unknown, depth: number): string | null {
    if (depth > 6 || node == null || typeof node !== 'object') return null;
    const obj = node as Record<string, unknown>;
    for (const key of ['usedNo', 'used_no', 'goodsUsedNo']) {
      const v = obj[key];
      if (v != null && v !== '') return String(v).trim();
    }
    for (const key of ['data', 'result', 'auctionInfo', 'productInfo']) {
      const found = walk(obj[key], depth + 1);
      if (found) return found;
    }
    return null;
  }
  return walk(json, 0);
}

/** 抢购历史单条记录 */
export interface AuctionHistoryRecord {
  userNickname: string;
  endTime: number;
  userImage: string | null;
  offerPrice: number;
}

/** 解析 dbd.auction.detail.history 响应 */
export function parseAuctionHistoryResponse(json: unknown): AuctionHistoryRecord[] {
  const root = json as Record<string, unknown>;
  const result = root.result as Record<string, unknown> | undefined;
  const data = result?.data ?? root.data;
  if (!Array.isArray(data)) return [];

  return data.map((item) => {
    const d = item as Record<string, unknown>;
    return {
      userNickname: String(d.userNickname ?? ''),
      endTime: normalizeTimeMs(d.endTime) ?? 0,
      userImage: d.userImage != null ? String(d.userImage) : null,
      offerPrice: d.offerPrice != null ? Number(d.offerPrice) : 0,
    };
  });
}

/** 从 status 响应中取出单条商品节点（兼容批量 map 与单条平铺） */
function pickStatusNode(data: unknown, auctionId: string): Record<string, unknown> {
  if (data == null || typeof data !== 'object') return {};
  const container = data as Record<string, unknown>;

  const keyed = container[auctionId];
  if (keyed != null && typeof keyed === 'object') {
    return keyed as Record<string, unknown>;
  }

  // 单条响应：data 直接包含 auctionId / currentPrice
  if (
    container.auctionId != null
    || container.currentPrice != null
    || container.currentSystemDate != null
  ) {
    return container;
  }

  return container;
}

/** 抢购状态解析结果 */
export interface ParsedStatus {
  currentPrice: number | null;
  bidCount: number | null;
  auctionStatus: number | null;
  serverTimeMs: number | null;
  actualEndTimeMs: number | null;
  currentBidder: string | null;
  spectatorCount: number | null;
  platformStatusExpired: boolean;
}

/** 出价记录单条 */
export interface BidRecordItem {
  userNickname: string;
  offerPrice: number;
  bidTimeMs: number | null;
  userImage: string | null;
}

/** 解析 paipai.auction.bidrecords 响应或快照 */
export function parseBidRecordsResponse(json: unknown): BidRecordItem[] {
  const root = json as Record<string, unknown>;
  const result = root.result as Record<string, unknown> | undefined;
  const data = result?.data ?? root.data ?? root;

  let list: unknown[] = [];
  if (Array.isArray(data)) {
    list = data;
  } else if (data != null && typeof data === 'object') {
    const d = data as Record<string, unknown>;
    const candidate = d.list ?? d.records ?? d.bidList ?? d.bidRecords ?? d.data;
    if (Array.isArray(candidate)) list = candidate;
  }

  return list.map((item) => {
    const row = item as Record<string, unknown>;
    const timeRaw =
      row.bidTime ?? row.offerTime ?? row.time ?? row.createTime ?? row.endTime;
    return {
      userNickname: String(row.userNickname ?? row.nickname ?? row.pin ?? '匿名'),
      offerPrice: row.offerPrice != null
        ? Number(row.offerPrice)
        : row.price != null
          ? Number(row.price)
          : 0,
      bidTimeMs: normalizeTimeMs(timeRaw),
      userImage: row.userImage != null ? String(row.userImage) : null,
    };
  });
}

export function parseStatusResponse(json: unknown, auctionId: string): ParsedStatus {
  const root = json as Record<string, unknown>;
  const data = (root.result as Record<string, unknown>)?.data ?? root.data ?? root;
  const d = pickStatusNode(data, auctionId);

  const serverTimeMs = normalizeTimeMs(d.currentSystemDate ?? d.serverTime);
  const actualEndTimeMs = normalizeTimeMs(d.actualEndTime ?? d.endTime);
  const auctionStatus = d.status != null ? Number(d.status) : null;

  const platformStatusExpired =
    auctionStatus === 4
    || (actualEndTimeMs != null
      && serverTimeMs != null
      && serverTimeMs >= actualEndTimeMs);

  return {
    currentPrice: d.currentPrice != null ? Number(d.currentPrice) : null,
    bidCount: d.num != null ? Number(d.num) : null,
    auctionStatus,
    serverTimeMs,
    actualEndTimeMs,
    currentBidder: pickString(d, 'currentBidder', 'bidderNickName') || null,
    spectatorCount: d.spectatorCount != null ? Number(d.spectatorCount) : null,
    platformStatusExpired,
  };
}
