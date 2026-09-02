import { z } from "zod";
import { apiHandler, dataResponse, requireApiContext } from "@/lib/api";
import { duplicateProduct } from "@/lib/services/product-bulk";
import { parseJson } from "@/lib/server";

const duplicateSchema = z.object({
  newName: z.string().trim().min(1).max(300),
});

export const POST = apiHandler(async (request) => {
  const id = z.string().uuid().parse(new URL(request.url).pathname.split("/").filter(Boolean).at(-2));
  const context = await requireApiContext(request, "inventory:write");
  const body = await parseJson(request, duplicateSchema, 16 * 1024);

  const result = await duplicateProduct(context.organizationId, id, body.newName);
  return dataResponse(result);
});
