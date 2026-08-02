import { z } from "zod";
import { apiHandler, dataResponse, requireApiContext, withIdempotency } from "@/lib/api";
import { reopenClosingPeriod, reopenPeriodSchema } from "@/lib/services/book-closing";
import { parseJson } from "@/lib/server";

export const POST = apiHandler(async (request) => {
  const id = z.string().uuid().parse(new URL(request.url).pathname.split("/").filter(Boolean).at(-2));
  const context = await requireApiContext(request, "finance:reopen");
  const input = await parseJson(request, reopenPeriodSchema);
  return withIdempotency(request, context, "finance.closing.reopen", { id, ...input }, async () => dataResponse(await reopenClosingPeriod(id, input, context)));
});
