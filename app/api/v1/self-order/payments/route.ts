import { z } from "zod";
import { eq } from "drizzle-orm";
import { apiHandler, dataResponse } from "@/lib/api";
import { withIdempotency } from "@/lib/api/idempotent";
import { db } from "@/db";
import { qrOrderTokens, salesOrders } from "@/db/schema";
import { AppError, parseJson } from "@/lib/server";
import { requireSelfOrderContext } from "@/lib/server/self-order-context";
import { createXenditCharge } from "@/lib/services/self-order";
import type { XenditPaymentMethod } from "@/lib/integrations/payments";

const schema = z.object({
  token: z.string().max(100).optional(),
  orderId: z.string().uuid(),
  customerName: z.string().max(150).optional(),
  paymentMethods: z.array(z.enum(["QRIS", "OVO", "DANA", "SHOPEEPAY", "PAY_LATER"])).max(5).optional(),
});

void eq;
void qrOrderTokens;

void (null as unknown as XenditPaymentMethod);

export const POST = apiHandler(async (request) => {
  const input = await parseJson(request, schema);
  const context = await requireSelfOrderContext(request);

  // Validasi order milik tenant yang sama dengan token
  const [order] = await db
    .select({ id: salesOrders.id, organizationId: salesOrders.organizationId, tableId: salesOrders.tableId })
    .from(salesOrders)
    .where(eq(salesOrders.id, input.orderId))
    .limit(1);
  if (!order || order.organizationId !== context.organizationId) {
    throw new AppError("NOT_FOUND", "Order tidak ditemukan");
  }
  if (order.tableId && order.tableId !== context.tableId) {
    throw new AppError("FORBIDDEN", "Order bukan milik meja token ini");
  }

  return withIdempotency(
    request,
    context,
    "self-order.charge",
    input,
    async () => {
      const result = await createXenditCharge(input.orderId, {
        customerName: input.customerName,
        paymentMethods: input.paymentMethods as XenditPaymentMethod[] | undefined,
      });
      return dataResponse(result, { status: 200 });
    },
  );
});
