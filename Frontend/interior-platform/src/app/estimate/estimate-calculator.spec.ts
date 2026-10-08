import {
  calculateEstimateTotal,
  calculateRoomArea,
  sanitizeRoomDimension,
} from './estimate-calculator';

/** A sample rate for the pure maths; the app itself has no built-in rate. */
const RATE = 1500;

describe('calculateEstimateTotal', () => {
  it('90 sq.ft × ₹1,500 = ₹135,000', () => {
    expect(calculateEstimateTotal(90, RATE)).toBe(135000);
  });

  it('180 sq.ft × ₹1,500 = ₹270,000', () => {
    expect(calculateEstimateTotal(180, RATE)).toBe(270000);
  });

  it('0 sq.ft returns ₹0', () => {
    expect(calculateEstimateTotal(0, RATE)).toBe(0);
  });

  it('negative area returns ₹0', () => {
    expect(calculateEstimateTotal(-50, RATE)).toBe(0);
  });

  it('zero or negative rate returns ₹0', () => {
    expect(calculateEstimateTotal(100, 0)).toBe(0);
    expect(calculateEstimateTotal(100, -1500)).toBe(0);
  });

  it('NaN or Infinity inputs return ₹0, never NaN/Infinity', () => {
    for (const bad of [NaN, Infinity, -Infinity]) {
      expect(calculateEstimateTotal(bad, RATE)).toBe(0);
      expect(calculateEstimateTotal(100, bad)).toBe(0);
    }
    expect(Number.isFinite(calculateEstimateTotal(NaN, Infinity))).toBe(true);
  });
});

describe('calculateRoomArea', () => {
  it('width × length in feet', () => {
    expect(calculateRoomArea(12, 15)).toBe(180);
    expect(calculateRoomArea(10.5, 20)).toBe(210);
  });

  it('zero dimensions yield 0', () => {
    expect(calculateRoomArea(0, 15)).toBe(0);
    expect(calculateRoomArea(12, 0)).toBe(0);
  });

  it('negative dimensions yield 0', () => {
    expect(calculateRoomArea(-12, 15)).toBe(0);
    expect(calculateRoomArea(12, -15)).toBe(0);
  });

  it('NaN or Infinity dimensions yield 0, never NaN/Infinity', () => {
    for (const bad of [NaN, Infinity, -Infinity]) {
      expect(calculateRoomArea(bad, 15)).toBe(0);
      expect(calculateRoomArea(12, bad)).toBe(0);
    }
    expect(Number.isFinite(calculateRoomArea(NaN, Infinity))).toBe(true);
  });
});

describe('sanitizeRoomDimension', () => {
  it('keeps positive finite values', () => {
    expect(sanitizeRoomDimension(12)).toBe(12);
    expect(sanitizeRoomDimension(10.5)).toBe(10.5);
  });

  it('maps zero, negative, NaN and Infinity to 0', () => {
    expect(sanitizeRoomDimension(0)).toBe(0);
    expect(sanitizeRoomDimension(-4)).toBe(0);
    expect(sanitizeRoomDimension(NaN)).toBe(0);
    expect(sanitizeRoomDimension(Infinity)).toBe(0);
    expect(sanitizeRoomDimension(-Infinity)).toBe(0);
  });
});
