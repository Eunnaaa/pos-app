import { createHmac, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import { AppError } from "./errors";

const DEFAULT_TOLERANCE_SECONDS = 300;

export function signWebhook(payload: string, timestamp: number, secret: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${payload}`, "utf8").digest("hex");
}

export function verifyWebhookSignature(
  payload: string,
  signature: string,
  timestamp: number,
  secret: string,
  toleranceSeconds = DEFAULT_TOLERANCE_SECONDS,
): void {
  if (!Number.isSafeInteger(timestamp)) throw new AppError("UNAUTHENTICATED", "Invalid webhook timestamp");
  if (Math.abs(Date.now() / 1_000 - timestamp) > toleranceSeconds) {
    throw new AppError("UNAUTHENTICATED", "Webhook signature has expired");
  }
  const expected = Buffer.from(signWebhook(payload, timestamp, secret), "hex");
  let supplied: Buffer;
  try {
    supplied = Buffer.from(signature.replace(/^sha256=/, ""), "hex");
  } catch {
    throw new AppError("UNAUTHENTICATED", "Invalid webhook signature");
  }
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    throw new AppError("UNAUTHENTICATED", "Invalid webhook signature");
  }
}

export function assertSafeWebhookUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new AppError("VALIDATION_ERROR", "Webhook URL must be HTTPS and contain no credentials");
  }
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) {
    throw new AppError("VALIDATION_ERROR", "Webhook URL cannot target a local host");
  }
  const ipVersion = isIP(host);
  if (ipVersion === 4 && /^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)) {
    throw new AppError("VALIDATION_ERROR", "Webhook URL cannot target a private network");
  }
  if (ipVersion === 6 && (host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80:"))) {
    throw new AppError("VALIDATION_ERROR", "Webhook URL cannot target a private network");
  }
  return url;
}
