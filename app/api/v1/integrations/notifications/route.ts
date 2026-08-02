import { z } from "zod";
import { apiHandler, dataResponse, requireApiContext, withIdempotency } from "@/lib/api";
import { sendEmail, sendTelegram, sendWhatsApp } from "@/lib/integrations";
import { parseJson } from "@/lib/server";

const schema = z.discriminatedUnion("channel", [
  z.object({ channel: z.literal("whatsapp"), recipient: z.string().min(8).max(30), message: z.string().min(1).max(4_000) }),
  z.object({ channel: z.literal("telegram"), recipient: z.string().min(1).max(100), message: z.string().min(1).max(4_000) }),
  z.object({ channel: z.literal("email"), recipient: z.string().email(), subject: z.string().min(1).max(200), html: z.string().min(1).max(100_000) }),
]);

export const POST = apiHandler(async (request) => {
  const context = await requireApiContext(request, "settings:manage");
  const input = await parseJson(request, schema);
  return withIdempotency(request, context, `notification.${input.channel}`, input, async () => {
    const result = input.channel === "whatsapp"
      ? await sendWhatsApp(input.recipient, input.message)
      : input.channel === "telegram"
        ? await sendTelegram(input.recipient, input.message)
        : await sendEmail(input.recipient, input.subject, input.html);
    return dataResponse({ channel: input.channel, result }, { status: 202 });
  });
});
