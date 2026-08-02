import "server-only";
import { getServerEnv } from "@/config/env";
import { providerRequest, requireProviderConfig } from "./http";

export async function sendWhatsApp(to: string, message: string) {
  const env = getServerEnv();
  const config = requireProviderConfig("WhatsApp", { token: env.WHATSAPP_ACCESS_TOKEN, phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID });
  return providerRequest("WhatsApp", `https://graph.facebook.com/v22.0/${config.phoneNumberId}/messages`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${config.token}` },
    body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to, type: "text", text: { preview_url: false, body: message } }),
  });
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
