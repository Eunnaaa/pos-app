import { z } from "zod";
import { apiHandler, dataResponse, requireApiContext } from "@/lib/api";
import { bulkUpdateProducts } from "@/lib/services/product-bulk";

const bulkUpdateSchema = z.object({
  productIds: z.array(z.string().uuid()).min(1),
  updates: z.object({
    name: z.string().optional(),
    categoryId: z.string().uuid().optional(),
    brandId: z.string().uuid().optional(),
    isActive: z.boolean().optional(),
  }),
});

export const POST = apiHandler(async (request) => {
  const context = await requireApiContext(request, "sales:write");
  const body = bulkUpdateSchema.parse(await request.json());

  const result = await bulkUpdateProducts(context.organizationId, body);
  return dataResponse(result);
});
