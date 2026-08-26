import { apiHandler, dataResponse, requireApiContext, withIdempotency } from "@/lib/api";
import { createStockTransfer, stockTransferSchema } from "@/lib/services/inventory-workflows";
import { assertFeatureEnabled } from "@/lib/services/subscription";
import { parseJson } from "@/lib/server";

export const POST = apiHandler(async (request) => {
  const context = await requireApiContext(request, "inventory:write");
  await assertFeatureEnabled(context.organizationId, "multiBranchTransfer", "Fitur Transfer Stok Antar Cabang");
  const input = await parseJson(request, stockTransferSchema);
  return withIdempotency(request, context, "inventory.transfer.create", input, async () =>
    dataResponse(await createStockTransfer(input, context), { status: 201 }),
  );
});
