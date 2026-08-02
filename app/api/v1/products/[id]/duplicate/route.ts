import { z } from "zod";
import { apiHandler, dataResponse, requireApiContext } from "@/lib/api";
import { duplicateProduct } from "@/lib/services/product-bulk";

const duplicateSchema = z.object({
  newName: z.string().min(1),
});

export const POST = apiHandler(async (request) => {
  const id = z.string().uuid().parse(new URL(request.url).pathname.split("/").filter(Boolean).at(-2));
  const context = await requireApiContext(request, "sales:write");
  const body = duplicateSchema.parse(await request.json());

  const result = await duplicateProduct(context.organizationId, id, body.newName);
  return dataResponse(result);
});
