export type ClosingTotals = {
  salesGross: string;
  salesNet: string;
  discounts: string;
  tax: string;
  cost: string;
  profit: string;
  refunds: string;
  expenses: string;
  cashIn: string;
  cashOut: string;
  orders: number;
  paymentMethods: Record<string, string>;
};

export const zeroClosingTotals = (): ClosingTotals => ({ salesGross: "0", salesNet: "0", discounts: "0", tax: "0", cost: "0", profit: "0", refunds: "0", expenses: "0", cashIn: "0", cashOut: "0", orders: 0, paymentMethods: {} });

export function addClosingTotals(left: ClosingTotals, right: ClosingTotals): ClosingTotals {
  const sum = (key: keyof Omit<ClosingTotals, "orders" | "paymentMethods">) => (BigInt(left[key]) + BigInt(right[key])).toString();
  const paymentMethods: Record<string, string> = { ...left.paymentMethods };
  for (const [method, amount] of Object.entries(right.paymentMethods)) paymentMethods[method] = (BigInt(paymentMethods[method] ?? "0") + BigInt(amount)).toString();
  return { salesGross: sum("salesGross"), salesNet: sum("salesNet"), discounts: sum("discounts"), tax: sum("tax"), cost: sum("cost"), profit: sum("profit"), refunds: sum("refunds"), expenses: sum("expenses"), cashIn: sum("cashIn"), cashOut: sum("cashOut"), orders: left.orders + right.orders, paymentMethods };
}
