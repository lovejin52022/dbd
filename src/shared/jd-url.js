/**
 * 多宝岛商品详情页 URL 识别与解析
 *
 * 示例：
 * https://dbd.m.jd.com/ppdbd/pages/detail-v2/index?id=404150571&skuid=100243016865
 */

/** 详情页主机名 */
const PRODUCT_DETAIL_HOST = 'dbd.m.jd.com';

/** 详情页路径（detail-v2） */
const PRODUCT_DETAIL_PATH = '/ppdbd/pages/detail-v2/index';

/**
 * 规范化路径：去掉末尾斜杠
 * @param {string} pathname
 */
function normalizePathname(pathname) {
  return pathname.replace(/\/+$/, '') || '/';
}

/**
 * 判断是否为多宝岛商品详情页 URL
 * @param {string} urlString
 * @returns {boolean}
 */
function isProductDetailUrl(urlString) {
  return parseProductDetailUrl(urlString) !== null;
}

/**
 * 解析商品详情页 URL，提取 auctionId（id）与 skuid
 * @param {string} urlString
 * @returns {{
 *   auctionId: string,
 *   skuid: string | null,
 *   cprice: string | null,
 *   url: string,
 * } | null}
 */
function parseProductDetailUrl(urlString) {
  if (!urlString || typeof urlString !== 'string') {
    return null;
  }

  try {
    const url = new URL(urlString.trim());

    // 主机名必须匹配
    if (url.hostname !== PRODUCT_DETAIL_HOST) {
      return null;
    }

    // 路径必须匹配 detail-v2
    if (normalizePathname(url.pathname) !== PRODUCT_DETAIL_PATH) {
      return null;
    }

    // id 为必填的拍卖品 ID
    const auctionId = url.searchParams.get('id')?.trim();
    if (!auctionId) {
      return null;
    }

    const skuid = url.searchParams.get('skuid')?.trim() || null;
    const cprice = url.searchParams.get('cprice')?.trim() || null;

    return {
      auctionId,
      skuid,
      cprice,
      url: urlString.trim(),
    };
  } catch {
    return null;
  }
}

module.exports = {
  PRODUCT_DETAIL_HOST,
  PRODUCT_DETAIL_PATH,
  isProductDetailUrl,
  parseProductDetailUrl,
};
