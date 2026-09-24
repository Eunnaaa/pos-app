import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { salesOrders, salesPayments } from "@/db/schema";
import { apiHandler, dataResponse, requireApiContext, withIdempotency } from "@/lib/api";
import { createMidtransPayment, createXenditPayment } from "@/lib/integrations";
import { AppError, assertBranchAccess, parseJson } from "@/lib/server";
import { getServerEnv } from "@/config/env";
import { resolveMidtransServerKey } from "@/lib/services/payment-credentials";
import { assertOnlineOrderReservable } from "@/lib/services/stock-reservations";

const schema = z.object({
  provider: z.enum(["midtrans", "xendit"]),
  orderId: z.string().uuid(),
  customerName: z.string().min(2).max(150),
  customerEmail: z.string().email().optional(),
});

export const GET = apiHandler(async (request) => {
  const context = await requireApiContext(request, "pos:write");
  return dataResponse({ midtransConfigured: Boolean(await resolveMidtransServerKey(context.branchId)) });
});

export const POST = apiHandler(async (request) => {
  const context = await requireApiContext(request, "pos:write");
  const input = await parseJson(request, schema);
  const [order] = await db
    .select({ id: salesOrders.id, branchId: salesOrders.branchId, orderNumber: salesOrders.orderNumber, totalAmount: salesOrders.totalAmount, status: salesOrders.status })
    .from(salesOrders)
    .where(and(eq(salesOrders.id, input.orderId), eq(salesOrders.organizationId, context.organizationId)))
    .limit(1);
  if (!order) throw new AppError("NOT_FOUND", "Order tidak ditemukan");
  assertBranchAccess(context.tenant, order.branchId);
  if (order.status !== "pending") throw new AppError("CONFLICT", "Order tidak menunggu pembayaran online");
  const expiresAt = await assertOnlineOrderReservable(order.id);
  const [payment] = await db
    .select({ id: salesPayments.id, amount: salesPayments.amount })
    .from(salesPayments)
    .where(and(
      eq(salesPayments.orderId, order.id),
      eq(salesPayments.provider, input.provider),
    ))
    .limit(1);
  if (!payment) throw new AppError("CONFLICT", "Provider tidak cocok dengan payment order");

  const env = getServerEnv();
  const providerInput = {
    reference: order.orderNumber,
    amount: Number(payment.amount),
    customerName: input.customerName,
    customerEmail: input.customerEmail,
    description: `Pembayaran order ${order.orderNumber}`,
    successRedirectUrl: `${env.BETTER_AUTH_URL}/dashboard/pos?payment=${encodeURIComponent(order.orderNumber)}`,
    expiresAt,
  };
  return withIdempotency(request, context, `payment.${input.provider}`, input, async () => {
    const result = input.provider === "midtrans"
      ? await createMidtransPayment({ ...providerInput, serverKey: await resolveMidtransServerKey(order.branchId) })
      : await createXenditPayment(providerInput);
    return dataResponse(result, { status: 201 });
  });
});
