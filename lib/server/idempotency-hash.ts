import { createHash } from "node:crypto";

function canonicalize(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "bigint") return `{"$bigint":${JSON.stringify(value.toString())}}`;
  if (typeof value === "undefined") return `{"$undefined":true}`;
  if (typeof value !== "object") return JSON.stringify(value);
  if (value instanceof Date) return `{"$date":${JSON.stringify(value.toISOString())}}`;
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalize(item)}`)
    .join(",")}}`;
}

export function hashIdempotentRequest(value: unknown): string {
  return createHash("sha256").update(canonicalize(value)).digest("hex");
}
