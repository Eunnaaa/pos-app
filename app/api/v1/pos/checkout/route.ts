import { apiHandler, dataResponse, requireApiContext, withIdempotency } from "@/lib/api";
import { checkout, checkoutContextFromApi, checkoutSchema } from "@/lib/services/checkout";
import { AppError, assertBranchAccess, parseJson } from "@/lib/server";

export const POST = apiHandler(async (request) => {
  const context = await requireApiContext(request, "pos:write");
  const parsed = await parseJson(request, checkoutSchema);
  if (parsed.channel !== "pos") throw new AppError("FORBIDDEN", "Endpoint POS hanya menerima channel pos");
  const input = {
    ...parsed,
    offlineReference: parsed.offlineReference ?? request.headers.get("idempotency-key") ?? undefined,
  };
  assertBranchAccess(context.tenant, input.branchId);
  return withIdempotency(request, context, "pos.checkout", input, async () =>
    dataResponse(await checkout(input, checkoutContextFromApi(context)), { status: 201 }),
  );
});
