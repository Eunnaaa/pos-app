import { z } from "zod";
import { apiHandler, dataResponse, requireApiContext } from "@/lib/api";
import { deleteProductImage } from "@/lib/services/product-images";

const deleteSchema = z.object({
  id: z.string().uuid(),
});

export const DELETE = apiHandler(async (request) => {
  const context = await requireApiContext(request, "sales:write");
  const body = deleteSchema.parse(await request.json());

  await deleteProductImage(context.organizationId, body.id);
  return dataResponse({ success: true });
});
