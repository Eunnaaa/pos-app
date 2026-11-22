import { apiHandler, dataResponse, requireApiContext } from "@/lib/api";
import { parseJson } from "@/lib/server";
import { confirmExternalRefund, confirmRefundSchema } from "@/lib/services/returns";

export const POST = apiHandler(async (request) => {
  const context = await requireApiContext(request, "finance:write");
  const input = await parseJson(request, confirmRefundSchema);
  return dataResponse(await confirmExternalRefund(input, context));
});
