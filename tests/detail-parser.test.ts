import { describe, expect, it } from 'vitest';
import {
  parseDetailResponse,
  parseSaleInfoResponse,
  parseStatusResponse,
  parseAuctionHistoryResponse,
  parseUsedNo,
} from '../src/main/services/detail-parser';

describe('detail-parser', () => {
  it('解析开始/结束时间', () => {
    const parsed = parseDetailResponse({
      result: { data: { title: '商品A', startTime: 1000, actualEndTime: 2000, status: 1 } },
    });
    expect(parsed.title).toBe('商品A');
    expect(parsed.auctionStartTime).toBe(1000);
    expect(parsed.auctionEndTime).toBe(2000);
    expect(parsed.platformStatusExpired).toBe(false);
  });

  it('结束时间优先使用 actualEndTime', () => {
    const parsed = parseDetailResponse({
      result: {
        data: {
          startTime: 1_700_000_000_000,
          endTime: 1_700_000_100_000,
          actualEndTime: 1_700_000_200_000,
        },
      },
    });
    expect(parsed.auctionEndTime).toBe(1_700_000_200_000);
  });

  it('秒级时间戳自动转毫秒', () => {
    const parsed = parseDetailResponse({
      result: { data: { startTime: 1700000000, actualEndTime: 1700003600 } },
    });
    expect(parsed.auctionStartTime).toBe(1700000000000);
    expect(parsed.auctionEndTime).toBe(1700003600000);
  });

  it('解析 address 直出字段', () => {
    const parsed = parseSaleInfoResponse({
      result: { data: { address: '22-1930-49324-49399' } },
    });
    expect(parsed.address).toBe('22-1930-49324-49399');
  });

  it('解析多宝岛 saleInfo 的 freightArea', () => {
    const sample = {
      code: 0,
      result: {
        code: 200,
        data: {
          hasStock: false,
          stockCheckArea: '22-1930-49324-49399',
          hasAuctionStock: true,
          freightArea: '22-1930-49324-49399',
          freightAreaText: '四川成都市双流区中和街道',
        },
        message: 'success',
      },
    };
    const parsed = parseSaleInfoResponse(sample);
    expect(parsed.address).toBe('22-1930-49324-49399');
    expect(parsed.freightAreaText).toBe('四川成都市双流区中和街道');
  });

  it('从嵌套 saleInfo 解析 area', () => {
    const parsed = parseSaleInfoResponse({
      result: { data: { saleInfo: { area: '1-72-2819-0' } } },
    });
    expect(parsed.address).toBe('1-72-2819-0');
  });

  it('从省市区镇 ID 拼接 address', () => {
    const parsed = parseSaleInfoResponse({
      result: {
        data: {
          consigneeAddress: {
            provinceId: 22,
            cityId: 1930,
            countyId: 49324,
            townId: 49399,
          },
        },
      },
    });
    expect(parsed.address).toBe('22-1930-49324-49399');
  });

  it('解析单条抢购状态（多宝岛现行格式）', () => {
    const parsed = parseStatusResponse(
      {
        code: 0,
        result: {
          code: 200,
          data: {
            auctionId: 404150966,
            currentPrice: 14,
            num: 3,
            status: 2,
            currentBidder: 'jd***Qj',
            actualEndTime: 1782829916000,
            currentSystemDate: 1782829795427,
            spectatorCount: 12,
          },
        },
      },
      '404150966',
    );
    expect(parsed.currentPrice).toBe(14);
    expect(parsed.bidCount).toBe(3);
    expect(parsed.auctionStatus).toBe(2);
    expect(parsed.serverTimeMs).toBe(1782829795427);
    expect(parsed.actualEndTimeMs).toBe(1782829916000);
    expect(parsed.currentBidder).toBe('jd***Qj');
    expect(parsed.spectatorCount).toBe(12);
    expect(parsed.platformStatusExpired).toBe(false);
  });

  it('解析批量 map 格式抢购状态', () => {
    const parsed = parseStatusResponse(
      {
        result: {
          data: {
            '12345': {
              currentPrice: 99.5,
              num: 3,
              status: 1,
              serverTime: 1700000000000,
            },
          },
        },
      },
      '12345',
    );
    expect(parsed.currentPrice).toBe(99.5);
    expect(parsed.bidCount).toBe(3);
    expect(parsed.auctionStatus).toBe(1);
    expect(parsed.serverTimeMs).toBe(1700000000000);
    expect(parsed.platformStatusExpired).toBe(false);
  });

  it('actualEndTime 已过则判定为平台过期', () => {
    const parsed = parseStatusResponse(
      {
        result: {
          data: {
            status: 2,
            actualEndTime: 1000,
            currentSystemDate: 2000,
          },
        },
      },
      '1',
    );
    expect(parsed.platformStatusExpired).toBe(true);
  });

  it('解析抢购历史列表', () => {
    const list = parseAuctionHistoryResponse({
      code: 0,
      result: {
        code: 200,
        data: [
          {
            userNickname: 'jd***2r',
            endTime: 1782825956000,
            userImage: 'http://example.com/a.jpg',
            offerPrice: 33,
          },
        ],
      },
    });
    expect(list).toHaveLength(1);
    expect(list[0].userNickname).toBe('jd***2r');
    expect(list[0].offerPrice).toBe(33);
    expect(list[0].endTime).toBe(1782825956000);
  });

  it('从 detail 解析 usedNo', () => {
    const usedNo = parseUsedNo({
      result: { data: { usedNo: '44181172600659663' } },
    });
    expect(usedNo).toBe('44181172600659663');
  });
});
