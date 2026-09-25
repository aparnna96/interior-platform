/**
 * Area-based estimate calculation (Pillar 5, Stage 5.1).
 *
 * Framework-free: no Angular, no signals, no services, no HTTP.
 * Pure function of (areaSqFt, ratePerSqFt) only.
 */

/** Demo rate in ₹ per sq.ft. Single source of truth for placeholder pricing. */
export const DEMO_RATE = 1500;

/**
 * Returns the estimated total for a given area and per-sq.ft rate.
 * Pure arithmetic — no component, browser, or backend dependency.
 */
export function calculateEstimateTotal(areaSqFt: number, ratePerSqFt: number): number {
  return areaSqFt * ratePerSqFt;
}
