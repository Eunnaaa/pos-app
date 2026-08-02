import { apiHandler, dataResponse, requireApiContext } from "@/lib/api";
import { listClosingPeriods } from "@/lib/services/book-closing";

export const GET = apiHandler(async (request) => {
  const context = await requireApiContext(request, "finance:read");
  return dataResponse(await listClosingPeriods(context));
});
