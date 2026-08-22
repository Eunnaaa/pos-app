export type ShiftReportData = {
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
  branchPhone: string | null;
  orgPhone: string | null;
  userName: string | null;
  orders: string | null;
  totalAmount: string | null;
};

const rupiah = (value?: string | null) => `Rp ${Number(value ?? 0).toLocaleString("id-ID")}`;

function formatBreakdown(breakdown: Record<string, unknown>): string {
  const lines: string[] = [];
  for (const [method, value] of Object.entries(breakdown ?? {})) {
    const paid = (value as { paid?: string })?.paid;
    if (paid && paid !== "0") lines.push(`${method}: ${rupiah(paid)}`);
  }
  return lines.length ? lines.join(" | ") : "Tidak ada pembayaran";
}

export function buildShiftReportMessage(row: ShiftReportData): string {
  const breakdown = (row.paymentBreakdown ?? {}) as Record<string, unknown>;
  return [
    "📊 Laporan Tutup Shift Kasir — Kedai-Ku",
    `Kasir: ${row.userName ?? "-"}`,
    `Lokasi: ${row.branchName ?? "-"} • ${row.registerName} (${row.registerCode})`,
    `Waktu Tutup: ${row.closedAt ? new Date(row.closedAt).toLocaleString("id-ID") : "-"}`,
    "────────────────────",
    `Total Transaksi: ${row.orders ?? "0"} order`,
    `Total Penjualan: ${rupiah(row.totalAmount)}`,
    `Kas Expected: ${rupiah(row.expectedClosingAmount)}`,
    `Kas Aktual: ${rupiah(row.actualClosingAmount)}`,
    `Selisih Kas: ${rupiah(row.varianceAmount)}`,
    "────────────────────",
    `Rincian Pembayaran:\n${formatBreakdown(breakdown)}`,
  ].join("\n");
}
