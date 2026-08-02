import { apiHandler, dataResponse, requireApiContext, withIdempotency } from "@/lib/api";
import { closeMonth, closeMonthSchema } from "@/lib/services/book-closing";
import { parseJson } from "@/lib/server";

export const POST = apiHandler(async (request) => {
  const context = await requireApiContext(request, "finance:close");
  const input = await parseJson(request, closeMonthSchema);
  return withIdempotency(request, context, "finance.closing.month", input, async () => dataResponse(await closeMonth(input, context), { status: 201 }));
});
