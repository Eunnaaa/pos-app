import { z } from "zod";
import { apiHandler, dataResponse, requireApiContext } from "@/lib/api";
import { resumeHeldOrder } from "@/lib/services/pos-holds";

export const POST = apiHandler(async (request) => {
  const id = z.string().uuid().parse(new URL(request.url).pathname.split("/").filter(Boolean).at(-2));
  const context = await requireApiContext(request, "pos:write");

  const held = await resumeHeldOrder(context.organizationId, id, context.session.user.id);
  return dataResponse(held);
});
