import { z } from "zod";
import { apiHandler, requireApiContext } from "@/lib/api";
import { exportProductsAsJSON } from "@/lib/services/product-bulk";

const querySchema = z.object({
  productIds: z.string().optional(), // CSV of product IDs
});

export const GET = apiHandler(async (request) => {
  const context = await requireApiContext(request, "sales:read");
  const url = new URL(request.url);
  const query = querySchema.parse(Object.fromEntries(url.searchParams));

  const productIds = query.productIds?.split(",").filter(Boolean);
  const json = await exportProductsAsJSON(context.organizationId, productIds);

  return new Response(json, {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="products-${new Date().toISOString()}.json"`,
    },
  });
});
