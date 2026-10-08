/**
 * Area-based estimate calculation (Pillar 5, Stage 5.1).
 *
 * Framework-free: no Angular, no signals, no services, no HTTP.
 * Pure functions of explicit inputs only — deterministic and easy to test.
 *
 * There is no built-in rate here. The rate is Admin-managed on the server
 * (Rate Master) and passed in by the caller; these functions only drive the
 * on-screen preview. Saved estimates are always priced by the server.
 */

/**
 * Dimensions must be finite and positive; anything else (zero, negative,
 * NaN, Infinity, non-numeric) contributes nothing instead of poisoning the
 * result. The UI therefore never displays NaN or Infinity.
 */
export function sanitizeRoomDimension(value: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Returns the room area in sq.ft. for visualizer dimensions in feet:
 * area = width × length. Invalid dimensions yield 0.
 */
export function calculateRoomArea(widthFt: number, lengthFt: number): number {
  return sanitizeRoomDimension(widthFt) * sanitizeRoomDimension(lengthFt);
}

/**
 * Returns the estimated total for a given area and per-sq.ft rate:
 * estimatedAmount = area × rate. Invalid inputs yield 0.
 */
export function calculateEstimateTotal(areaSqFt: number, ratePerSqFt: number): number {
  const area = typeof areaSqFt === 'number' && Number.isFinite(areaSqFt) && areaSqFt > 0 ? areaSqFt : 0;
  const rate =
    typeof ratePerSqFt === 'number' && Number.isFinite(ratePerSqFt) && ratePerSqFt > 0 ? ratePerSqFt : 0;
  return area * rate;
}
