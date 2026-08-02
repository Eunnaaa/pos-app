import { z } from "zod";
import { apiHandler, dataResponse, requireApiContext, withIdempotency } from "@/lib/api";
import { createMidtransPayment, createXenditPayment } from "@/lib/integrations";
import { parseJson } from "@/lib/server";

const schema = z.object({
  provider: z.enum(["midtrans", "xendit"]),
  reference: z.string().min(3).max(100),
  amount: z.number().int().positive().max(10_000_000_000),
  customerName: z.string().min(2).max(150),
  customerEmail: z.string().email().optional(),
  description: z.string().min(2).max(255),
});

export const POST = apiHandler(async (request) => {
  const context = await requireApiContext(request, "pos:write");
  const input = await parseJson(request, schema);
  return withIdempotency(request, context, `payment.${input.provider}`, input, async () => {
    const result = input.provider === "midtrans" ? await createMidtransPayment(input) : await createXenditPayment(input);
    return dataResponse(result, { status: 201 });
  });
});
