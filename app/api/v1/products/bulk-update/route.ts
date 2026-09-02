import { z } from "zod";
import { apiHandler, dataResponse, requireApiContext } from "@/lib/api";
import { bulkUpdateProducts } from "@/lib/services/product-bulk";
import { parseJson } from "@/lib/server";

const bulkUpdateSchema = z.object({
  productIds: z.array(z.string().uuid()).min(1).max(500),
  updates: z.object({
    name: z.string().trim().min(1).max(300).optional(),
    categoryId: z.string().uuid().optional(),
    brandId: z.string().uuid().optional(),
    isActive: z.boolean().optional(),
  }),
});

export const POST = apiHandler(async (request) => {
  const context = await requireApiContext(request, "inventory:write");
  const body = await parseJson(request, bulkUpdateSchema, 128 * 1024);

  const result = await bulkUpdateProducts(context.organizationId, body);
  return dataResponse(result);
});
