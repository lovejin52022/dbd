import { describe, expect, it } from 'vitest';
import {
  parseDetailResponse,
  parseSaleInfoResponse,
  parseStatusResponse,
} from '../src/main/services/detail-parser';

describe('detail-parser', () => {
  it('解析开始/结束时间', () => {
    const parsed = parseDetailResponse({
      result: { data: { title: '商品A', startTime: 1000, endTime: 2000, status: 1 } },
    });
    expect(parsed.title).toBe('商品A');
    expect(parsed.auctionStartTime).toBe(1000);
    expect(parsed.auctionEndTime).toBe(2000);
    expect(parsed.platformStatusExpired).toBe(false);
  });

  it('解析 address', () => {
    const parsed = parseSaleInfoResponse({
      result: { data: { address: '22-1930-49324-49399' } },
    });
    expect(parsed.address).toBe('22-1930-49324-49399');
  });

  it('解析当前价与出价次数', () => {
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
});
