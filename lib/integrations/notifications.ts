import "server-only";
import { getServerEnv } from "@/config/env";
import { AppError } from "@/lib/server";
import { providerRequest, requireProviderConfig } from "./http";

export async function sendWhatsApp(to: string, message: string) {
  const env = getServerEnv();
  const config = requireProviderConfig("Fonnte", { token: env.WHATSAPP_ACCESS_TOKEN });
  let target = to.replace(/[^0-9]/g, "");
  if (target.startsWith("0")) target = `62${target.slice(1)}`;
  const body = new URLSearchParams({ target, message, countryCode: "62" });
  let response: Response;
  try {
    response = await fetch("https://api.fonnte.com/send", {
      method: "POST",
      headers: { authorization: config.token, "content-type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new AppError("BAD_REQUEST", "Fonnte is unavailable", { details: { provider: "Fonnte" } });
  }
  const text = await response.text();
  let payload: unknown = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = text.slice(0, 1_000); }
  if (!response.ok) {
    const code = response.status === 429 ? "RATE_LIMITED" : response.status >= 500 ? "INTERNAL_ERROR" : "BAD_REQUEST";
    throw new AppError(code, "Fonnte send failed", { details: { provider: "Fonnte", status: response.status, response: payload } });
  }
  return payload;
}

export async function sendTelegram(chatId: string, message: string) {
  const env = getServerEnv();
  const config = requireProviderConfig("Telegram", { botToken: env.TELEGRAM_BOT_TOKEN });
  return providerRequest("Telegram", `https://api.telegram.org/bot${config.botToken}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: message }),
  });
}

export async function sendEmail(to: string, subject: string, html: string) {
  const env = getServerEnv();
  const config = requireProviderConfig("Email", { apiUrl: env.EMAIL_API_URL, apiKey: env.EMAIL_API_KEY });
  return providerRequest("Email", config.apiUrl, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify({ to, subject, html }),
  });
}
