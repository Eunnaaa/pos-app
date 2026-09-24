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

/** Allocate an order discount across lines without losing a rupiah to rounding. */
export function allocateDiscount(amounts: readonly bigint[], discount: bigint): bigint[] {
  const total = amounts.reduce((sum, amount) => sum + amount, 0n);
  if (discount < 0n || discount > total) throw new RangeError("Discount exceeds item total");
  if (total === 0n) return amounts.map(() => 0n);
  const shares = amounts.map((amount) => (discount * amount) / total);
  let remainder = discount - shares.reduce((sum, share) => sum + share, 0n);
  const order = amounts.map((amount, index) => ({
    index,
    fraction: (discount * amount) % total,
  })).sort((a, b) => a.fraction === b.fraction ? a.index - b.index : a.fraction > b.fraction ? -1 : 1);
  for (const { index } of order) {
    if (remainder === 0n) break;
    shares[index] += 1n;
    remainder -= 1n;
  }
  return shares;
}
