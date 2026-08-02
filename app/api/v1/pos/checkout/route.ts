import { apiHandler, dataResponse, requireApiContext, withIdempotency } from "@/lib/api";
import { checkout, checkoutSchema } from "@/lib/services/checkout";
import { parseJson } from "@/lib/server";

export const POST = apiHandler(async (request) => {
  const context = await requireApiContext(request, "pos:write");
  const input = await parseJson(request, checkoutSchema);
  return withIdempotency(request, context, "pos.checkout", input, async () =>
    dataResponse(await checkout(input, context), { status: 201 }),
  );
});
