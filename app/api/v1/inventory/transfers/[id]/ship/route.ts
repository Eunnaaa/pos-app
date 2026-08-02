import { z } from "zod";
import { apiHandler, dataResponse, requireApiContext, withIdempotency } from "@/lib/api";
import { shipStockTransfer } from "@/lib/services/inventory-workflows";

export const POST = apiHandler(async (request) => {
  const id = z.string().uuid().parse(new URL(request.url).pathname.split("/").filter(Boolean).at(-2));
  const context = await requireApiContext(request, "inventory:write");
  return withIdempotency(request, context, "inventory.transfer.ship", { id }, async () =>
    dataResponse(await shipStockTransfer(id, context)),
  );
});
