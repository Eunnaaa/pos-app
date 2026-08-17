import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { cashRegisterSessions } from "@/db/schema";
import { apiHandler, dataResponse, requireApiContext, withIdempotency } from "@/lib/api";
import { closeCashSession, closeCashSessionSchema } from "@/lib/services/cash-sessions";
import { sendShiftReportWhatsApp } from "@/lib/services/shift-report-notification";
import { parseJson } from "@/lib/server";

export const POST = apiHandler(async (request) => {
  const id = z.string().uuid().parse(new URL(request.url).pathname.split("/").filter(Boolean).at(-2));
  const context = await requireApiContext(request, "pos:write");
  const input = await parseJson(request, closeCashSessionSchema);
  return withIdempotency(request, context, "finance.cash-session.close", { id, ...input }, async () => {
    const closed = await closeCashSession(id, input, context);
    try {
      const [session] = await db.select({ notifiedAt: cashRegisterSessions.notifiedAt }).from(cashRegisterSessions).where(eq(cashRegisterSessions.id, id)).limit(1);
      if (!session.notifiedAt) {
        const sent = await sendShiftReportWhatsApp(id);
        if (sent) await db.update(cashRegisterSessions).set({ notifiedAt: new Date(), updatedAt: new Date() }).where(eq(cashRegisterSessions.id, id));
      }
    } catch {  }
    return dataResponse(closed);
  });
});