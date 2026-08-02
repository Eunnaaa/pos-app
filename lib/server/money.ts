import { AppError } from "./errors";

export type Money = { amount: bigint; currency: string };

export function money(amount: bigint, currency = "IDR"): Money {
  if (!/^[A-Z]{3}$/.test(currency)) throw new AppError("VALIDATION_ERROR", "Invalid ISO 4217 currency code");
  return { amount, currency };
}

export function parseMoney(value: string, currency = "IDR", fractionDigits = 0): Money {
  if (!Number.isInteger(fractionDigits) || fractionDigits < 0 || fractionDigits > 6) {
    throw new AppError("VALIDATION_ERROR", "Invalid currency fraction digits");
  }
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!match) throw new AppError("VALIDATION_ERROR", "Invalid monetary amount");
  const fraction = match[3] ?? "";
  if (fraction.length > fractionDigits) throw new AppError("VALIDATION_ERROR", "Monetary amount has too many decimal places");
  const scale = 10n ** BigInt(fractionDigits);
  const minor = BigInt(match[2]) * scale + BigInt(fraction.padEnd(fractionDigits, "0") || "0");
  return money(match[1] === "-" ? -minor : minor, currency);
}

export function addMoney(left: Money, right: Money): Money {
  assertSameCurrency(left, right);
  return money(left.amount + right.amount, left.currency);
}

export function subtractMoney(left: Money, right: Money): Money {
  assertSameCurrency(left, right);
  return money(left.amount - right.amount, left.currency);
}

export function allocateMoney(value: Money, weights: readonly bigint[]): Money[] {
  if (weights.length === 0 || weights.some((weight) => weight < 0n)) {
    throw new AppError("VALIDATION_ERROR", "Allocation weights must be non-negative and non-empty");
  }
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0n);
  if (totalWeight === 0n) throw new AppError("VALIDATION_ERROR", "At least one allocation weight must be positive");

  let remainder = value.amount;
  return weights.map((weight, index) => {
    const share = index === weights.length - 1 ? remainder : (value.amount * weight) / totalWeight;
    remainder -= share;
    return money(share, value.currency);
  });
}

export function formatMoney(value: Money, locale = "id-ID", fractionDigits = 0): string {
  const scale = 10 ** fractionDigits;
  const amount = Number(value.amount) / scale;
  if (!Number.isSafeInteger(Number(value.amount))) {
    throw new AppError("BAD_REQUEST", "Amount is too large to format safely");
  }
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: value.currency,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(amount);
}

function assertSameCurrency(left: Money, right: Money): void {
  if (left.currency !== right.currency) throw new AppError("VALIDATION_ERROR", "Currency mismatch");
}
