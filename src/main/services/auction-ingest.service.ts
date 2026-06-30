import type Database from 'better-sqlite3';
import { JD_FUNCTIONS, buildDetailV2Body, buildSaleInfoBody, buildBidRecordsBody } from '../../shared/constants';
import { resolveLifecycleStatus } from '../../shared/lifecycle';
import { upsertAuctionList } from '../db/auction-list.repo';
import { insertDetailSnapshot } from '../db/auction-detail.repo';
import { insertBidRecordsSnapshot } from '../db/bid-records.repo';
import { parseDetailResponse, parseSaleInfoResponse, parseAddressFromJson, parseUsedNo } from './detail-parser';
import type { JdApiService } from './jd-api.service';
import { IngestError, assertJdApiOk } from './jd-response';

/** 从 saleInfo / detail 响应中解析区域 address */
export function resolveAuctionAddress(detailJson: unknown, saleInfoJson: unknown): string | null {
  return (
    parseSaleInfoResponse(saleInfoJson).address
    ?? parseAddressFromJson(saleInfoJson)
    ?? parseAddressFromJson(detailJson)
  );
}

/**
 * 从 URL 加入抢单列表：必须成功调用 detail.v2 + saleInfo，并解析到 address
 */
export async function ingestAuctionFromUrl(
  db: Database.Database,
  jdApi: JdApiService,
  params: { id: string; skuid: string | null; url: string; title: string },
): Promise<void> {
  upsertAuctionList(db, { id: params.id, skuid: params.skuid, url: params.url, title: params.title });

  try {
    // 加入时必须并行请求详情与 saleInfo（区域 address）
    const [detailJson, saleInfoJson] = await Promise.all([
      jdApi.call(JD_FUNCTIONS.DETAIL_V2, buildDetailV2Body(params.id)),
      jdApi.call(JD_FUNCTIONS.SALE_INFO, buildSaleInfoBody(params.id)),
    ]);

    assertJdApiOk(detailJson, 'dbd.auction.detail.v2');
    assertJdApiOk(saleInfoJson, 'dbd.auction.detail.saleInfo');

    insertDetailSnapshot(db, params.id, detailJson, saleInfoJson);

    const detail = parseDetailResponse(detailJson);
    const usedNo = parseUsedNo(detailJson);
    const address = resolveAuctionAddress(detailJson, saleInfoJson);
    if (!address) {
      throw new IngestError(
        'saleInfo 未返回区域 address。请确认：① 已在多宝岛登录；② 账号已设置默认收货地址；③ 在商品详情页点击「加入抢单列表」',
      );
    }

    const lifecycleStatus = resolveLifecycleStatus({
      nowMs: Date.now(),
      startTimeMs: detail.auctionStartTime,
      endTimeMs: detail.auctionEndTime,
      platformStatusExpired: detail.platformStatusExpired,
    });

    upsertAuctionList(db, {
      id: params.id,
      url: params.url,
      title: detail.title || params.title,
      lifecycleStatus,
      auctionStartTime: detail.auctionStartTime,
      auctionEndTime: detail.auctionEndTime,
      address,
      usedNo,
      dataIncomplete: 0,
    });

    if (lifecycleStatus === 'expired') {
      const bidJson = await jdApi.call(
        JD_FUNCTIONS.BID_RECORDS,
        buildBidRecordsBody(params.id, address),
      );
      insertBidRecordsSnapshot(db, params.id, bidJson);
    }
  } catch (err) {
    upsertAuctionList(db, {
      id: params.id,
      url: params.url,
      dataIncomplete: 1,
    });
    throw err;
  }
}
