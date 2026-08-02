export type SettlementCalculationInput = {
  openingAmount: bigint;
  payments: Record<string, bigint>;
  refunds: Record<string, bigint>;
  cashChange: bigint;
  cashIn: bigint;
  cashOut: bigint;
  actuals: Record<string, bigint>;
};

export function calculateSettlement(input: SettlementCalculationInput) {
  const methods = new Set(["cash", ...Object.keys(input.payments), ...Object.keys(input.refunds), ...Object.keys(input.actuals)]);
  const breakdown: Record<string, { expected: bigint; actual: bigint; variance: bigint }> = {};
  for (const method of methods) {
    let expected = (input.payments[method] ?? 0n) - (input.refunds[method] ?? 0n);
    if (method === "cash") expected += input.openingAmount - input.cashChange + input.cashIn - input.cashOut;
    const actual = input.actuals[method] ?? expected;
    breakdown[method] = { expected, actual, variance: actual - expected };
  }
  return { expectedCash: breakdown.cash.expected, actualCash: breakdown.cash.actual, cashVariance: breakdown.cash.variance, breakdown };
}
