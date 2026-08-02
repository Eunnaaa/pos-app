import { z } from "zod";
import { apiHandler, dataResponse, requireApiContext } from "@/lib/api";
import { bulkDeleteProducts } from "@/lib/services/product-bulk";

const bulkDeleteSchema = z.object({
  productIds: z.array(z.string().uuid()).min(1),
});

export const POST = apiHandler(async (request) => {
  const context = await requireApiContext(request, "sales:write");
  const body = bulkDeleteSchema.parse(await request.json());

  const result = await bulkDeleteProducts(context.organizationId, body);
  return dataResponse(result);
});
