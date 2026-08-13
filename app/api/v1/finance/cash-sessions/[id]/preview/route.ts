import { z } from "zod";
import { apiHandler, dataResponse, requireApiContext } from "@/lib/api";
import { previewSettlement } from "@/lib/services/cash-sessions";

export const GET = apiHandler(async (request) => {
  const id = z.string().uuid().parse(new URL(request.url).pathname.split("/").filter(Boolean).at(-2));
  const context = await requireApiContext(request, "pos:write");
  const preview = await previewSettlement(id, context);
  return dataResponse(preview);
});
