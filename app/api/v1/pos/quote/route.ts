import { apiHandler, dataResponse, requireApiContext } from "@/lib/api";
import { checkoutContextFromApi, checkoutSchema, quoteCheckout } from "@/lib/services/checkout";
import { assertBranchAccess, parseJson } from "@/lib/server";

export const POST = apiHandler(async (request) => {
  const context = await requireApiContext(request, "pos:write");
  const input = await parseJson(request, checkoutSchema);
  assertBranchAccess(context.tenant, input.branchId);
  return dataResponse(await quoteCheckout(input, checkoutContextFromApi(context)));
});
