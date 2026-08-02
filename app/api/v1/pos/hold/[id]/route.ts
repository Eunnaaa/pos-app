import { z } from "zod";
import { apiHandler, dataResponse, requireApiContext } from "@/lib/api";
import { discardHeldOrder } from "@/lib/services/pos-holds";

export const DELETE = apiHandler(async (request) => {
  const id = z.string().uuid().parse(new URL(request.url).pathname.split("/").filter(Boolean).at(-1));
  const context = await requireApiContext(request, "pos:write");

  await discardHeldOrder(context.organizationId, id, context.session.user.id);
  return dataResponse({ success: true });
});
