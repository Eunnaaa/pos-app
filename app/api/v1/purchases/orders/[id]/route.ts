import { z } from "zod";
import { apiHandler, dataResponse, requireApiContext } from "@/lib/api";
import { getPurchaseOrder } from "@/lib/services/purchase-orders";

export const GET = apiHandler(async (request) => {
  const id = z.string().uuid().parse(new URL(request.url).pathname.split("/").filter(Boolean).at(-1));
  const context = await requireApiContext(request, "purchases:read");
  return dataResponse(await getPurchaseOrder(id, context));
});
