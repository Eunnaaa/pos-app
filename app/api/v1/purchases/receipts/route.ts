import { apiHandler, dataResponse, requireApiContext, withIdempotency } from "@/lib/api";
import { receivePurchase, receivePurchaseSchema } from "@/lib/services/purchasing";
import { parseJson } from "@/lib/server";

export const POST = apiHandler(async (request) => {
  const context = await requireApiContext(request, "purchases:write");
  const input = await parseJson(request, receivePurchaseSchema);
  return withIdempotency(request, context, "purchases.receive", input, async () =>
    dataResponse(await receivePurchase(input, context), { status: 201 }),
  );
});
