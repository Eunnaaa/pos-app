import { z } from "zod";
import { apiHandler, dataResponse, requireApiContext, withIdempotency } from "@/lib/api";
import { parseJson } from "@/lib/server";
import {
  cancelStockOpname,
  getStockOpnameDetail,
  updateStockOpnameCounts,
  updateStockOpnameSchema,
} from "@/lib/services/stock-opname";

export const GET = apiHandler(async (request) => {
  const id = z.string().uuid().parse(new URL(request.url).pathname.split("/").filter(Boolean).at(-1));
  const apiContext = await requireApiContext(request, "inventory:read");
  const detail = await getStockOpnameDetail(id, apiContext);
  return dataResponse(detail);
});

export const PUT = apiHandler(async (request) => {
  const id = z.string().uuid().parse(new URL(request.url).pathname.split("/").filter(Boolean).at(-1));
  const apiContext = await requireApiContext(request, "inventory:write");
  const input = await parseJson(request, updateStockOpnameSchema);
  return withIdempotency(request, apiContext, "inventory.opname.update", { id, ...input }, async () => {
    const result = await updateStockOpnameCounts(id, input, apiContext);
    return dataResponse(result);
  });
});

export const DELETE = apiHandler(async (request) => {
  const id = z.string().uuid().parse(new URL(request.url).pathname.split("/").filter(Boolean).at(-1));
  const apiContext = await requireApiContext(request, "inventory:write");
  return withIdempotency(request, apiContext, "inventory.opname.cancel", { id }, async () => {
    const result = await cancelStockOpname(id, apiContext);
    return dataResponse(result);
  });
});
