import { z } from "zod";
import { eq } from "drizzle-orm";
import { apiHandler, dataResponse, withIdempotency } from "@/lib/api";
import { db } from "@/db";
import { salesOrders } from "@/db/schema";
import { AppError, parseJson } from "@/lib/server";
import { requireMatchingSelfOrderContext, requireSelfOrderContext } from "@/lib/server/self-order-context";
import { createSelfOrderPayment } from "@/lib/services/self-order";

const schema = z.object({
  token: z.string().max(100).optional(),
  orderId: z.string().uuid(),
  customerName: z.string().max(150).optional(),
  paymentMethods: z.array(z.enum(["QRIS", "OVO", "DANA", "SHOPEEPAY", "PAY_LATER"])).max(5).optional(),
});

export const POST = apiHandler(async (request) => {
  const input = await parseJson(request, schema);
  const context = input.token
    ? await requireMatchingSelfOrderContext(request, input.token)
    : await requireSelfOrderContext(request);

  // Validasi order milik tenant yang sama dengan token
  const [order] = await db
    .select({ id: salesOrders.id, organizationId: salesOrders.organizationId, tableId: salesOrders.tableId })
    .from(salesOrders)
    .where(eq(salesOrders.id, input.orderId))
    .limit(1);
  if (!order || order.organizationId !== context.organizationId) {
    throw new AppError("NOT_FOUND", "Order tidak ditemukan");
  }
  if (order.tableId !== context.tableId) {
    throw new AppError("FORBIDDEN", "Order bukan milik meja token ini");
  }

  return withIdempotency(request, context, `self-order.payment.${input.orderId}`, input, async () => {
    const charge = await createSelfOrderPayment(input.orderId);
    return dataResponse(charge, { status: 200 });
  });
});
