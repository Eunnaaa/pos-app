import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { organizationSettings } from "@/db/schema";
import { sendWhatsApp } from "@/lib/integrations";

import { buildShiftReportMessage, type ShiftReportData as SessionRow } from "./shift-report-message";
export { buildShiftReportMessage, type ShiftReportData } from "./shift-report-message";

const PROFILE_NAMESPACE = "profile";

export async function buildShiftReport(sessionId: string): Promise<SessionRow> {
  const result = await db.execute(sql`
    select s.id, s.organization_id as "organizationId", s.user_id as "userId",
           s.opening_amount::text as "openingAmount",
           s.expected_closing_amount::text as "expectedClosingAmount",
           s.actual_closing_amount::text as "actualClosingAmount",
           s.variance_amount::text as "varianceAmount",
           s.payment_breakdown as "paymentBreakdown",
           s.closed_at as "closedAt",
           r.name as "registerName", r.code as "registerCode", b.name as "branchName",
           b.phone as "branchPhone",
           o.phone as "orgPhone",
           u.name as "userName",
           (select count(*)::text from sales_orders so where so.cash_session_id = s.id) as orders,
           (select coalesce(sum(total_amount), 0)::text from sales_orders so where so.cash_session_id = s.id and so.status in ('paid','partially_refunded','refunded')) as "totalAmount"
    from cash_register_sessions s
    join cash_registers r on r.id = s.register_id
    left join branches b on b.id = r.branch_id
    left join organizations o on o.id = s.organization_id
    left join "user" u on u.id = s.user_id
    where s.id = ${sessionId}
    limit 1
  `);
  return result.rows[0] as SessionRow;
}

export async function sendShiftReportWhatsApp(sessionId: string): Promise<boolean> {
  const row = await buildShiftReport(sessionId);
  if (!row) return false;

  let phone = row.branchPhone?.trim() || row.orgPhone?.trim();

  if (!phone) {
    const [setting] = await db
      .select({ value: organizationSettings.value })
      .from(organizationSettings)
      .where(and(eq(organizationSettings.organizationId, row.organizationId), eq(organizationSettings.namespace, PROFILE_NAMESPACE)))
      .limit(1);
    phone = (setting?.value as { phone?: string } | undefined)?.phone?.trim();
  }

  if (!phone) {
    console.warn(`[ShiftReportWhatsApp] Nomor telepon toko tidak ditemukan untuk organization ${row.organizationId}`);
    return false;
  }

  try {
    await sendWhatsApp(phone, buildShiftReportMessage(row));
    return true;
  } catch (error) {
    console.error(`[ShiftReportWhatsApp] Gagal mengirim WhatsApp ke ${phone}:`, error);
    return false;
  }
}