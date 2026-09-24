import { z } from "zod";
import { apiHandler, dataResponse, withIdempotency } from "@/lib/api";
import { parseJson } from "@/lib/server";
import { requireMatchingSelfOrderContext } from "@/lib/server/self-order-context";
import { createSelfOrder } from "@/lib/services/self-order";
import { assertFeatureEnabled } from "@/lib/services/subscription";

const itemSchema = z.object({
  variantId: z.string().uuid(),
  quantity: z.number().int().positive().max(999),
  notes: z.string().max(500).optional(),
});

const schema = z.object({
  token: z.string().min(1).max(100),
  items: z.array(itemSchema).min(1).max(100),
  notes: z.string().max(2_000).optional(),
  customerName: z.string().max(150).optional(),
  customerPhone: z.string().trim().min(8).max(24).optional(),
  paymentMethod: z.enum(["qris", "e_wallet"]),
});

export const POST = apiHandler(async (request) => {
  const input = await parseJson(request, schema);
  const context = await requireMatchingSelfOrderContext(request, input.token);
  await assertFeatureEnabled(context.organizationId, "selfOrderQR", "Fitur Self Order QR Meja");
  return withIdempotency(
    request,
    context,
    "self-order.create",
    input,
    async () => {
      const result = await createSelfOrder({
        token: input.token,
        items: input.items,
        notes: input.notes,
        customerName: input.customerName,
        customerPhone: input.customerPhone,
        paymentMethod: input.paymentMethod,
      });
      return dataResponse(result, { status: 201 });
    },
  );
});
