import { describe, expect, it } from 'vitest';
import { calcOfferPrice } from '../src/shared/order-price';

describe('calcOfferPrice', () => {
  it('未填期望价 → current+1', () => {
    expect(calcOfferPrice(10, null)).toBe(11);
  });
  it('current <= target → target', () => {
    expect(calcOfferPrice(80, 100)).toBe(100);
  });
  it('current > target → current+1', () => {
    expect(calcOfferPrice(105, 100)).toBe(106);
  });
});
