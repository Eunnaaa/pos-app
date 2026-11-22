import { apiHandler, dataResponse, requireApiContext, withIdempotency } from "@/lib/api";
import { checkout, checkoutContextFromApi, posCheckoutSchema } from "@/lib/services/checkout";
import { AppError, assertBranchAccess, parseJson } from "@/lib/server";

export const POST = apiHandler(async (request) => {
  const context = await requireApiContext(request, "pos:write");
  const { recovery, ...parsed } = await parseJson(request, posCheckoutSchema);
  if (parsed.channel !== "pos") throw new AppError("FORBIDDEN", "Endpoint POS hanya menerima channel pos");
  const input = {
    ...parsed,
    offlineReference: parsed.offlineReference ?? request.headers.get("idempotency-key") ?? undefined,
  };
  assertBranchAccess(context.tenant, input.branchId);
  const scope = `pos.checkout:${input.branchId}:${context.session.user.id}`;
  return withIdempotency(request, context, scope, input, async () =>
    dataResponse(await checkout(input, checkoutContextFromApi(context), recovery), { status: 201 }),
  );
});
