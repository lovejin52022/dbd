import type Database from 'better-sqlite3';
import { JD_FUNCTIONS, buildDetailV2Body, buildSaleInfoBody, buildBidRecordsBody } from '../../shared/constants';
import { resolveLifecycleStatus } from '../../shared/lifecycle';
import { upsertAuctionList } from '../db/auction-list.repo';
import { insertDetailSnapshot } from '../db/auction-detail.repo';
import { insertBidRecordsSnapshot } from '../db/bid-records.repo';
import { parseDetailResponse, parseSaleInfoResponse } from './detail-parser';
import type { JdApiService } from './jd-api.service';

/** 从 URL 加入抢单列表：拉取详情、解析生命周期、必要时写入出价记录 */
export async function ingestAuctionFromUrl(
  db: Database.Database,
  jdApi: JdApiService,
  params: { id: string; skuid: string | null; url: string; title: string },
): Promise<void> {
  upsertAuctionList(db, { id: params.id, skuid: params.skuid, url: params.url, title: params.title });

  try {
    const [detailJson, saleInfoJson] = await Promise.all([
      jdApi.call(JD_FUNCTIONS.DETAIL_V2, buildDetailV2Body(params.id)),
      jdApi.call(JD_FUNCTIONS.SALE_INFO, buildSaleInfoBody(params.id)),
    ]);
    insertDetailSnapshot(db, params.id, detailJson, saleInfoJson);

    const detail = parseDetailResponse(detailJson);
    const saleInfo = parseSaleInfoResponse(saleInfoJson);
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
      address: saleInfo.address,
      dataIncomplete: 0,
    });

    if (lifecycleStatus === 'expired' && saleInfo.address) {
      const bidJson = await jdApi.call(
        JD_FUNCTIONS.BID_RECORDS,
        buildBidRecordsBody(params.id, saleInfo.address),
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
