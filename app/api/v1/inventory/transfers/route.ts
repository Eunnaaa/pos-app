import { apiHandler, dataResponse, requireApiContext, withIdempotency } from "@/lib/api";
import { createStockTransfer, stockTransferSchema } from "@/lib/services/inventory-workflows";
import { parseJson } from "@/lib/server";

export const POST = apiHandler(async (request) => {
  const context = await requireApiContext(request, "inventory:write");
  const input = await parseJson(request, stockTransferSchema);
  return withIdempotency(request, context, "inventory.transfer.create", input, async () =>
    dataResponse(await createStockTransfer(input, context), { status: 201 }),
  );
});
