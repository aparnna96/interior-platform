import { DEMO_RATE, calculateEstimateTotal } from './estimate-calculator';

describe('calculateEstimateTotal', () => {
  it('90 sq.ft × ₹1,500 = ₹135,000', () => {
    expect(calculateEstimateTotal(90, DEMO_RATE)).toBe(135000);
  });

  it('180 sq.ft × ₹1,500 = ₹270,000', () => {
    expect(calculateEstimateTotal(180, DEMO_RATE)).toBe(270000);
  });

  it('0 sq.ft returns ₹0', () => {
    expect(calculateEstimateTotal(0, DEMO_RATE)).toBe(0);
  });
});
