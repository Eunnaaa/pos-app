import { z } from "zod";
import { apiHandler, dataResponse, withIdempotency } from "@/lib/api";
import { parseJson } from "@/lib/server";
import { requireSelfOrderContext } from "@/lib/server/self-order-context";
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
  const context = await requireSelfOrderContext(request);
  await assertFeatureEnabled(context.organizationId, "selfOrderQR", "Fitur Self Order QR Meja");
  if (input.token !== context.tokenId && input.token.length > 0) {
    const verify = await requireSelfOrderContext(request);
    // token di body harus resolve ke context yang sama
    if (verify.organizationId !== context.organizationId || verify.tableId !== context.tableId) {
      return dataResponse({ error: "Token mismatch" }, { status: 400 });
    }
  }
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
