import { z } from "zod";
import { apiHandler, dataResponse, requireApiContext } from "@/lib/api";
import { uploadProductImage } from "@/lib/services/product-images";

const uploadSchema = z.object({
  productId: z.string().uuid(),
  imageUrl: z.string().url(),
  altText: z.string().optional(),
});

export const POST = apiHandler(async (request) => {
  const context = await requireApiContext(request, "sales:write");
  const body = uploadSchema.parse(await request.json());

  const result = await uploadProductImage(
    context.organizationId,
    body.productId,
    body.imageUrl,
    body.altText,
  );
  return dataResponse(result);
});
