import { z } from "zod";
import { apiHandler, dataResponse, requireApiContext } from "@/lib/api";
import { deleteProductImage } from "@/lib/services/product-images";
import { parseJson } from "@/lib/server";

const deleteSchema = z.object({
  id: z.string().uuid(),
});

export const DELETE = apiHandler(async (request) => {
  const context = await requireApiContext(request, "inventory:write");
  const body = await parseJson(request, deleteSchema, 16 * 1024);

  await deleteProductImage(context.organizationId, body.id);
  return dataResponse({ success: true });
});
