import { apiHandler, dataResponse, requireApiContext, withIdempotency } from "@/lib/api";
import { adjustStock, stockAdjustmentSchema } from "@/lib/services/inventory-workflows";
import { parseJson } from "@/lib/server";

export const POST = apiHandler(async (request) => {
  const context = await requireApiContext(request, "inventory:write");
  const input = await parseJson(request, stockAdjustmentSchema);
  return withIdempotency(request, context, "inventory.adjustment", input, async () =>
    dataResponse(await adjustStock(input, context), { status: 201 }),
  );
});
