/** 导航 URL 常量 */
export const URLS = {
  MINE: 'https://dbd.m.jd.com/ppdbd/pages/mine/index?scene=null',
  HOME: 'https://dbd.m.jd.com/ppdbd/paimai',
  LOGIN_PREFIX: 'https://plogin.m.jd.com/login/login',
} as const;

/** 多宝岛「我的页面」默认 URL（兼容旧引用） */
export const DEFAULT_MINE_URL = URLS.MINE;

/** 京东 API functionId 常量 */
export const JD_FUNCTIONS = {
  DETAIL_V2: 'dbd.auction.detail.v2',
  SALE_INFO: 'dbd.auction.detail.saleInfo',
  BID_RECORDS: 'paipai.auction.bidrecords',
  CURRENT_AND_OFFER: 'paipai.auction.get_current_and_offerNum',
  OFFER_PRICE: 'paipai.auction.offerPrice',
} as const;

const DBD_API_VERSION = '20250109';

/** 详情 v2 请求体 */
export function buildDetailV2Body(auctionId: string, area = '') {
  return {
    auctionId,
    entryid: '',
    area,
    auctionProductType: 1,
    p: 2,
    dbdApiVersion: DBD_API_VERSION,
    mpSource: 1,
    sourceTag: 2,
  };
}

/** 销售信息请求体 */
export function buildSaleInfoBody(auctionId: string) {
  return { auctionId, mpSource: 1, sourceTag: 2 };
}

/** 出价记录请求体 */
export function buildBidRecordsBody(auctionId: string | string[], area: string) {
  const id = Array.isArray(auctionId) ? auctionId.join(',') : auctionId;
  return { ...buildDetailV2Body(id, area), auctionId: id };
}

/** 当前价/出价数请求体 */
export function buildStatusBody(auctionId: string | string[]) {
  const id = Array.isArray(auctionId) ? auctionId.join(',') : auctionId;
  return { auctionId: id, mpSource: 1, sourceTag: 2 };
}

/** 出价请求体 */
export function buildOfferPriceBody(params: {
  auctionId: string;
  price: number;
  ts: number;
  address: string;
}) {
  return {
    auctionId: Number(params.auctionId),
    price: params.price,
    ts: params.ts,
    entryid: '',
    address: params.address,
    mpSource: 1,
    sourceTag: 2,
  };
}
