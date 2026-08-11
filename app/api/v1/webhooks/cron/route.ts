import { apiHandler, dataResponse } from "@/lib/api";
import { getServerEnv } from "@/config/env";
import { cleanupAllExpiredHeldOrders } from "@/lib/services/pos-holds";
import { AppError } from "@/lib/server";

export const POST = apiHandler(async (request) => {
  const env = getServerEnv();
  if (!env.WEBHOOK_SECRET) throw new AppError("BAD_REQUEST", "WEBHOOK_SECRET belum dikonfigurasi");
  const auth = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!auth || auth !== env.WEBHOOK_SECRET) throw new AppError("FORBIDDEN", "Invalid webhook secret");

  const expired = await cleanupAllExpiredHeldOrders();
  return dataResponse({ task: "expire-held-orders", expired });
});