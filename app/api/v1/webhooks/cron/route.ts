import { apiHandler, dataResponse } from "@/lib/api";
import { getServerEnv } from "@/config/env";
import { cleanupAllExpiredHeldOrders } from "@/lib/services/pos-holds";
import { expirePendingOnlineOrders } from "@/lib/services/stock-reservations";
import { AppError, safeEqualSecret } from "@/lib/server";

export const POST = apiHandler(async (request) => {
  const env = getServerEnv();
  if (!env.WEBHOOK_SECRET) throw new AppError("BAD_REQUEST", "WEBHOOK_SECRET belum dikonfigurasi");
  const auth = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!auth || !safeEqualSecret(auth, env.WEBHOOK_SECRET)) throw new AppError("FORBIDDEN", "Invalid webhook secret");

  const [heldExpired, onlineExpired] = await Promise.all([
    cleanupAllExpiredHeldOrders(),
    expirePendingOnlineOrders(),
  ]);
  return dataResponse({ task: "expire-orders", heldExpired, onlineExpired });
});
