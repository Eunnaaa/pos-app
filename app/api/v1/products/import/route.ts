import { apiHandler, dataResponse, requireApiContext } from "@/lib/api";
import { parseJson } from "@/lib/server";
import { importProductsFromCSV } from "@/lib/services/product-bulk";
import { z } from "zod";

const importSchema = z.object({
  csv: z.string().min(10, "CSV data required"),
});

export const POST = apiHandler(async (request) => {
  const context = await requireApiContext(request, "inventory:write");
  const input = await parseJson(request, importSchema);
  const result = await importProductsFromCSV(context.organizationId, input.csv);
  return dataResponse(result, { status: 201 });
});
