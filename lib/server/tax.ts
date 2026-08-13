/**
 * Tax calculation utilities — pure functions with no server-only imports,
 * safe to use from tests and shared logic.
 */

/**
 * Convert a numeric percentage rate string (e.g. "11.0000") to basis points
 * (e.g. 1100n). 10000 basis points = 100%.
 *
 * Returns 0n for invalid, negative, or non-finite rates.
 */
export function parseRateToBps(rate: string): bigint {
  const num = Number.parseFloat(rate);
  if (!Number.isFinite(num) || num < 0) return 0n;
  return BigInt(Math.round(num * 100));
}

/**
 * Compute exclusive tax: the tax amount added on top of a net amount.
 * `tax = net * rate / 100`
 */
export function exclusiveTax(net: bigint, rateBps: bigint): bigint {
  if (rateBps <= 0n) return 0n;
  return (net * rateBps) / 10000n;
}

/**
 * Compute inclusive tax: the tax portion embedded within a gross amount.
 * `tax = gross * rate / (100 + rate)`
 */
export function inclusiveTax(gross: bigint, rateBps: bigint): bigint {
  if (rateBps <= 0n) return 0n;
  return (gross * rateBps) / (10000n + rateBps);
}
