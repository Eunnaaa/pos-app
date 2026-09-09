import { apiHandler, dataResponse, requireApiContext, withIdempotency } from "@/lib/api";
import { parseJson } from "@/lib/server";
import {
  createStockOpname,
  createStockOpnameSchema,
  listStockOpnames,
} from "@/lib/services/stock-opname";

export const GET = apiHandler(async (request) => {
  const context = await requireApiContext(request, "inventory:read");
  const { searchParams } = new URL(request.url);
  const warehouseId = searchParams.get("warehouseId") ?? undefined;
  const counts = await listStockOpnames(context, warehouseId);
  return dataResponse(counts);
});

export const POST = apiHandler(async (request) => {
  const context = await requireApiContext(request, "inventory:write");
  const input = await parseJson(request, createStockOpnameSchema);
  return withIdempotency(request, context, "inventory.opname.create", input, async () => {
    const result = await createStockOpname(input, context);
    return dataResponse(result, { status: 201 });
  });
});
