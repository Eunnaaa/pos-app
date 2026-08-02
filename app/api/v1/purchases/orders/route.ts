import { apiHandler, dataResponse, requireApiContext, withIdempotency } from "@/lib/api";
import { createPurchaseOrder, createPurchaseOrderSchema } from "@/lib/services/purchase-orders";
import { parseJson } from "@/lib/server";

export const POST = apiHandler(async (request) => {
  const context = await requireApiContext(request, "purchases:write");
  const input = await parseJson(request, createPurchaseOrderSchema);
  return withIdempotency(request, context, "purchases.order.create", input, async () => dataResponse(await createPurchaseOrder(input, context), { status: 201 }));
});
