import { apiHandler, dataResponse, requireApiContext, withIdempotency } from "@/lib/api";
import { closeDay, closeDaySchema } from "@/lib/services/book-closing";
import { parseJson } from "@/lib/server";

export const POST = apiHandler(async (request) => {
  const context = await requireApiContext(request, "finance:close");
  const input = await parseJson(request, closeDaySchema);
  return withIdempotency(request, context, "finance.closing.day", input, async () => dataResponse(await closeDay(input, context), { status: 201 }));
});
