import { apiHandler, dataResponse, requireApiContext, withIdempotency } from "@/lib/api";
import { closeYear, closeYearSchema } from "@/lib/services/book-closing";
import { parseJson } from "@/lib/server";

export const POST = apiHandler(async (request) => {
  const context = await requireApiContext(request, "finance:close");
  const input = await parseJson(request, closeYearSchema);
  return withIdempotency(request, context, "finance.closing.year", input, async () => dataResponse(await closeYear(input, context), { status: 201 }));
});
