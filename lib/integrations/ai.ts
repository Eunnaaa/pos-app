import "server-only";
import { getServerEnv } from "@/config/env";
import { AppError } from "@/lib/server";
import { providerRequest, requireProviderConfig } from "./http";

export type AiMessage = { role: "system" | "user" | "assistant"; content: string };

export async function askAi(messages: AiMessage[], structured = false, maxTokens = 1500): Promise<{ content: string; model: string }> {
  const env = getServerEnv();
  const config = requireProviderConfig("AI", { baseUrl: env.AI_BASE_URL, apiKey: env.AI_API_KEY });
  const result = await providerRequest<{ choices: { message: { content: string } }[]; model?: string }>("AI", `${config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify({ model: env.AI_MODEL, messages, temperature: 0.2, max_tokens: maxTokens, ...(structured ? { response_format: { type: "json_object" } } : {}) }),
  });
  const content = result.choices[0]?.message.content;
  if (!content) throw new AppError("BAD_REQUEST", "AI provider returned no content");
  return { content, model: result.model || env.AI_MODEL };
}
