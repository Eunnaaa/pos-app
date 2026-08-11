import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { organizationSettings } from "@/db/schema";
import { sendWhatsApp } from "@/lib/integrations";

const PROFILE_NAMESPACE = "profile";

type SessionRow = {
  id: string;
  organizationId: string;
  userId: string;
  openingAmount: string | null;
  expectedClosingAmount: string | null;
  actualClosingAmount: string | null;
  varianceAmount: string | null;
  paymentBreakdown: Record<string, unknown>;
  closedAt: Date | null;
  registerName: string;
  registerCode: string;
  branchName: string | null;
  userName: string | null;
  orders: string | null;
  totalAmount: string | null;
};

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
           u.name as "userName",
           (select count(*)::text from sales_orders so where so.cash_session_id = s.id) as orders,
           (select coalesce(sum(total_amount), 0)::text from sales_orders so where so.cash_session_id = s.id and so.status in ('paid','partially_refunded','refunded')) as "totalAmount"
    from cash_register_sessions s
    join cash_registers r on r.id = s.register_id
    left join branches b on b.id = r.branch_id
    left join "user" u on u.id = s.user_id
    where s.id = ${sessionId}
    limit 1
  `);
  return result.rows[0] as SessionRow;
}

const rupiah = (value?: string | null) => `Rp ${Number(value ?? 0).toLocaleString("id-ID")}`;

function formatBreakdown(breakdown: Record<string, unknown>): string {
  const lines: string[] = [];
  for (const [method, value] of Object.entries(breakdown ?? {})) {
    const paid = (value as { paid?: string })?.paid;
    if (paid && paid !== "0") lines.push(`${method}: ${rupiah(paid)}`);
  }
  return lines.length ? lines.join(" | ") : "Tidak ada pembayaran";
}

export function buildShiftReportMessage(row: SessionRow): string {
  const breakdown = (row.paymentBreakdown ?? {}) as Record<string, unknown>;
  return [
    "Laporan shift kasir",
    `Kasir: ${row.userName ?? "-"}`,
    `Lokasi: ${row.branchName ?? "-"} • ${row.registerName} (${row.registerCode})`,
    `Tutup: ${row.closedAt ? new Date(row.closedAt).toLocaleString("id-ID") : "-"}`,
    "",
    `Order: ${row.orders ?? "0"}`,
    `Penjualan: ${rupiah(row.totalAmount)}`,
    `Kas expected: ${rupiah(row.expectedClosingAmount)}`,
    `Kas aktual: ${rupiah(row.actualClosingAmount)}`,
    `Selisih: ${rupiah(row.varianceAmount)}`,
    "",
    `Pembayaran: ${formatBreakdown(breakdown)}`,
  ].join("\n");
}

export async function sendShiftReportWhatsApp(sessionId: string): Promise<boolean> {
  const row = await buildShiftReport(sessionId);
  const [setting] = await db
    .select({ value: organizationSettings.value })
    .from(organizationSettings)
    .where(and(eq(organizationSettings.organizationId, row.organizationId), eq(organizationSettings.namespace, PROFILE_NAMESPACE)))
    .limit(1);
  const phone = (setting?.value as { phone?: string } | undefined)?.phone;
  if (!phone) return false;
  await sendWhatsApp(phone, buildShiftReportMessage(row));
  return true;
}