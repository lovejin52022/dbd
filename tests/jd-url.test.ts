import { describe, expect, it } from 'vitest';
import { isProductDetailUrl, parseProductDetailUrl } from '../src/shared/jd-url';

describe('jd-url', () => {
  const sample =
    'https://dbd.m.jd.com/ppdbd/pages/detail-v2/index?id=404150571&skuid=100243016865';

  it('识别详情页', () => {
    expect(isProductDetailUrl(sample)).toBe(true);
  });

  it('解析 auctionId 作为列表 id', () => {
    const info = parseProductDetailUrl(sample);
    expect(info?.auctionId).toBe('404150571');
    expect(info?.skuid).toBe('100243016865');
  });

  it('非详情页返回 null', () => {
    expect(parseProductDetailUrl('https://dbd.m.jd.com/ppdbd/paimai')).toBeNull();
  });
});
