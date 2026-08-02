import { apiHandler, dataResponse, requireApiContext, withIdempotency } from "@/lib/api";
import { processSalesReturn, salesReturnSchema } from "@/lib/services/returns";
import { parseJson } from "@/lib/server";

export const POST = apiHandler(async (request) => {
  const context = await requireApiContext(request, "sales:write");
  const input = await parseJson(request, salesReturnSchema);
  return withIdempotency(request, context, "sales.return", input, async () =>
    dataResponse(await processSalesReturn(input, context), { status: 201 }),
  );
});
