import { apiHandler, dataResponse, requireApiContext } from "@/lib/api";
import { getActiveCashSession } from "@/lib/services/cash-sessions";

export const GET = apiHandler(async (request) => {
  const context = await requireApiContext(request, "pos:write");
  return dataResponse(await getActiveCashSession(context));
});
