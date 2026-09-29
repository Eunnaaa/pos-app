/** Allocate an order's final paid total across its lines without losing a rupiah. */
export function allocateRefundableLineTotals(
  lines: ReadonlyArray<{ id: string; amount: bigint; quantity: bigint }>,
  orderTotal: bigint,
): Map<string, bigint> {
  if (orderTotal < 0n) throw new RangeError("Order total cannot be negative");
  if (!lines.length) return new Map();

  const weights = lines.map((line) => line.amount > 0n ? line.amount : line.quantity);
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0n);
  if (totalWeight <= 0n) return new Map(lines.map((line) => [line.id, 0n]));

  const shares = weights.map((weight) => (orderTotal * weight) / totalWeight);
  let remainder = orderTotal - shares.reduce((sum, share) => sum + share, 0n);
  const priority = weights
    .map((weight, index) => ({ index, fraction: (orderTotal * weight) % totalWeight }))
    .sort((left, right) => left.fraction === right.fraction
      ? lines[left.index]!.id.localeCompare(lines[right.index]!.id)
      : left.fraction > right.fraction ? -1 : 1);

  for (const { index } of priority) {
    if (remainder === 0n) break;
    shares[index] += 1n;
    remainder -= 1n;
  }

  return new Map(lines.map((line, index) => [line.id, shares[index]!]));
}

/** Return the incremental refund for a quantity range, preserving rounding on the final unit. */
export function incrementalLineRefund(
  lineTotal: bigint,
  lineQuantity: bigint,
  previouslyReturned: bigint,
  quantityToReturn: bigint,
): bigint {
  if (lineQuantity <= 0n || previouslyReturned < 0n || quantityToReturn <= 0n) {
    throw new RangeError("Invalid refund quantity");
  }
  const nextReturned = previouslyReturned + quantityToReturn;
  if (nextReturned > lineQuantity) throw new RangeError("Refund quantity exceeds line quantity");
  return (lineTotal * nextReturned) / lineQuantity
    - (lineTotal * previouslyReturned) / lineQuantity;
}
