import { z } from "zod";
import { apiHandler, dataResponse } from "@/lib/api";
import { withIdempotency } from "@/lib/api/idempotent";
import { parseJson } from "@/lib/server";
import { requireSelfOrderContext } from "@/lib/server/self-order-context";
import { reorder } from "@/lib/services/self-order";

const itemSchema = z.object({
  variantId: z.string().uuid(),
  quantity: z.number().int().positive().max(999),
  notes: z.string().max(500).optional(),
});

const schema = z.object({
  token: z.string().min(1).max(100),
  parentOrderId: z.string().uuid(),
  items: z.array(itemSchema).min(1).max(100),
  notes: z.string().max(2_000).optional(),
  paymentMethod: z.enum(["qris", "e_wallet"]),
});

export const POST = apiHandler(async (request) => {
  const input = await parseJson(request, schema);
  const context = await requireSelfOrderContext(request);
  return withIdempotency(
    request,
    context,
    "self-order.reorder",
    input,
    async () => {
      const result = await reorder({
        token: input.token,
        parentOrderId: input.parentOrderId,
        items: input.items,
        notes: input.notes,
        paymentMethod: input.paymentMethod,
      });
      return dataResponse(result, { status: 201 });
    },
  );
});
