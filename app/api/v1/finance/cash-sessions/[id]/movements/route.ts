import { z } from "zod";
import { apiHandler, dataResponse, requireApiContext, withIdempotency } from "@/lib/api";
import { cashMovementSchema, recordCashMovement } from "@/lib/services/cash-sessions";
import { parseJson } from "@/lib/server";

export const POST = apiHandler(async (request) => {
  const id = z.string().uuid().parse(new URL(request.url).pathname.split("/").filter(Boolean).at(-2));
  const context = await requireApiContext(request, "pos:write");
  const input = await parseJson(request, cashMovementSchema);
  return withIdempotency(request, context, "finance.cash-movement", { id, ...input }, async () => dataResponse(await recordCashMovement(id, input, context), { status: 201 }));
});
