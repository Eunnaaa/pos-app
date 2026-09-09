import { z } from "zod";
import { apiHandler, dataResponse, requireApiContext, withIdempotency } from "@/lib/api";
import { parseJson } from "@/lib/server";
import {
  completeStockOpname,
  completeStockOpnameSchema,
} from "@/lib/services/stock-opname";

export const POST = apiHandler(async (request) => {
  const id = z.string().uuid().parse(new URL(request.url).pathname.split("/").filter(Boolean).at(-2));
  const apiContext = await requireApiContext(request, "inventory:write");
  const input = await parseJson(request, completeStockOpnameSchema);
  return withIdempotency(request, apiContext, "inventory.opname.complete", { id, ...input }, async () => {
    const result = await completeStockOpname(id, input, apiContext);
    return dataResponse(result);
  });
});
