import { z } from "zod";
import { db } from "@/db";
import { staffCalls } from "@/db/schema";
import { apiHandler, dataResponse } from "@/lib/api";
import { withIdempotency } from "@/lib/api/idempotent";
import { parseJson } from "@/lib/server";
import { requireSelfOrderContext } from "@/lib/server/self-order-context";

const schema = z.object({
  reason: z.string().max(200).optional(),
});

export const POST = apiHandler(async (request) => {
  const input = await parseJson(request, schema);
  const context = await requireSelfOrderContext(request);
  return withIdempotency(
    request,
    context,
    "self-order.call-staff",
    input,
    async () => {
      await db.insert(staffCalls).values({
        organizationId: context.organizationId,
        branchId: context.branchId,
        tableId: context.tableId,
        reason: input.reason,
        status: "pending",
      });
      return dataResponse({ ok: true }, { status: 201 });
    },
  );
});