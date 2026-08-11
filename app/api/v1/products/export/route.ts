import { z } from "zod";
import { apiHandler, requireApiContext } from "@/lib/api";
import { exportProductsAsJSON, exportProductsAsCSV } from "@/lib/services/product-bulk";

const querySchema = z.object({
  productIds: z.string().optional(),
  format: z.enum(["json", "csv"]).default("csv"),
});

export const GET = apiHandler(async (request) => {
  const context = await requireApiContext(request, "sales:read");
  const url = new URL(request.url);
  const query = querySchema.parse(Object.fromEntries(url.searchParams));

  const productIds = query.productIds?.split(",").filter(Boolean);
  const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");

  if (query.format === "json") {
    const json = await exportProductsAsJSON(context.organizationId, productIds);
    return new Response(json, {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="products-${timestamp}.json"`,
      },
    });
  }

  const csv = await exportProductsAsCSV(context.organizationId, productIds);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="products-${timestamp}.csv"`,
    },
  });
});
