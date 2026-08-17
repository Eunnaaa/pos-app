import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { qrOrderTokens } from "@/db/schema";
import { AppError } from "./errors";

export type SelfOrderContext = {
  requestId: string;
  tokenId: string;
  organizationId: string;
  branchId: string;
  tableId: string;
  ipAddress?: string;
  userAgent?: string;
};

/**
 * Resolve tenancy yang dipublikasikan via QR token tabel.
 * Tidak memerlukan sesi auth — endpoint self-order adalah anonim.
 * Token HARUS aktif dan belum kedaluwarsa.
 */
export async function requireSelfOrderContext(request: Request): Promise<SelfOrderContext> {
  const url = new URL(request.url);
  const token =
    (url.searchParams.get("token")?.trim() || request.headers.get("x-self-order-token")?.trim() || "");
  if (!token || token.length > 100) {
    throw new AppError("BAD_REQUEST", "Token self-order tidak valid");
  }

  const [row] = await db
    .select({
      id: qrOrderTokens.id,
      organizationId: qrOrderTokens.organizationId,
      branchId: qrOrderTokens.branchId,
      tableId: qrOrderTokens.tableId,
      expiresAt: qrOrderTokens.expiresAt,
    })
    .from(qrOrderTokens)
    .where(and(eq(qrOrderTokens.token, token), eq(qrOrderTokens.isActive, true)))
    .limit(1);

  if (!row) throw new AppError("NOT_FOUND", "Token self-order tidak ditemukan atau dinonaktifkan");
  if (row.expiresAt && row.expiresAt <= new Date()) {
    throw new AppError("CONFLICT", "Token self-order telah kedaluwarsa");
  }

  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim();
  return {
    requestId: request.headers.get("x-request-id")?.slice(0, 100) || crypto.randomUUID(),
    tokenId: row.id,
    organizationId: row.organizationId,
    branchId: row.branchId,
    tableId: row.tableId,
    ...(forwardedFor ? { ipAddress: forwardedFor.slice(0, 64) } : {}),
    ...(request.headers.get("user-agent")
      ? { userAgent: request.headers.get("user-agent")!.slice(0, 500) }
      : {}),
  };
}
