import { apiHandler, dataResponse, requireApiContext, withIdempotency } from "@/lib/api";
import { checkout, checkoutContextFromApi, checkoutSchema } from "@/lib/services/checkout";
import { parseJson } from "@/lib/server";

export const POST = apiHandler(async (request) => {
  const context = await requireApiContext(request, "pos:write");
  const input = await parseJson(request, checkoutSchema);
  return withIdempotency(request, context, "pos.checkout", input, async () =>
    dataResponse(await checkout(input, checkoutContextFromApi(context)), { status: 201 }),
  );
});
