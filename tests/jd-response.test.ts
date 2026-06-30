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
    expect(parsed.message).toBe('出价过低');
  });
});
