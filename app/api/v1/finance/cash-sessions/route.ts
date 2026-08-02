import { apiHandler, dataResponse, requireApiContext, withIdempotency } from "@/lib/api";
import { listCashSessions, openCashSession, openCashSessionSchema } from "@/lib/services/cash-sessions";
import { parseJson } from "@/lib/server";

export const GET = apiHandler(async (request) => {
  const context = await requireApiContext(request, "finance:read");
  return dataResponse(await listCashSessions(context));
});

export const POST = apiHandler(async (request) => {
  const context = await requireApiContext(request, "pos:write");
  const input = await parseJson(request, openCashSessionSchema);
  return withIdempotency(request, context, "finance.cash-session.open", input, async () => dataResponse(await openCashSession(input, context), { status: 201 }));
});
