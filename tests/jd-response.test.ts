import { describe, expect, it } from 'vitest';
import { parseOfferPriceResponse } from '../src/main/services/jd-response';

describe('jd-response', () => {
  it('解析 offerPrice 出价成功', () => {
    const parsed = parseOfferPriceResponse({
      code: 0,
      result: { code: 200, data: null, list: null, message: '出价成功' },
    });
    expect(parsed.success).toBe(true);
    expect(parsed.message).toBe('出价成功');
  });

  it('解析 offerPrice 业务失败', () => {
    const parsed = parseOfferPriceResponse({
      code: 0,
      result: { code: 500, message: '出价过低' },
    });
    expect(parsed.success).toBe(false);
    expect(parsed.message).toBe('出价过低 (code=500)');
  });

  it('解析 offerPrice 无文案时附带 code', () => {
    const parsed = parseOfferPriceResponse({
      code: 0,
      result: { code: 501 },
    });
    expect(parsed.success).toBe(false);
    expect(parsed.message).toBe('出价失败 (code=501)');
  });

  it('解析 offerPrice 兼容 errMsg 与 success=false', () => {
    const parsed = parseOfferPriceResponse({
      success: false,
      errMsg: '拍卖已结束',
      code: 3,
    });
    expect(parsed.success).toBe(false);
    expect(parsed.message).toBe('拍卖已结束 (code=3)');
  });
});
