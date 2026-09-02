import { z } from "zod";
import { apiHandler, dataResponse, requireApiContext } from "@/lib/api";
import { bulkDeleteProducts } from "@/lib/services/product-bulk";
import { parseJson } from "@/lib/server";

const bulkDeleteSchema = z.object({
  productIds: z.array(z.string().uuid()).min(1).max(500),
});

export const POST = apiHandler(async (request) => {
  const context = await requireApiContext(request, "inventory:write");
  const body = await parseJson(request, bulkDeleteSchema, 64 * 1024);

  const result = await bulkDeleteProducts(context.organizationId, body);
  return dataResponse(result);
});
