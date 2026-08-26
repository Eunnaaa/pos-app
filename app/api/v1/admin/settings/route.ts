import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { platformSettings } from "@/db/schema";
import { apiHandler, dataResponse } from "@/lib/api";
import { AppError, parseJson, requireSession } from "@/lib/server";
import { isSuperAdminEmail, getSuperAdminEmails } from "@/lib/super-admin";

const defaultSettings = {
  appName: "Kedai-Ku POS",
  appTagline: "Sistem Kasir & Operasional Terpadu F&B dan Retail",
  supportEmail: "support@kedai-ku.id",
  supportWhatsApp: "081234567890",
  currency: "IDR",
  timezone: "Asia/Jakarta",
  defaultTrialDays: 14,
  maintenanceMode: false,
  allowNewRegistrations: true,
  require2FAForAdmins: false,
  whatsappGatewayEnabled: true,
  customQrisImageUrl: "",
  customQrisPayload: "",
  qrisAccountName: "KEDAI-KU OFFICIAL",
  qrisBankName: "QRIS All Payment / GoPay / BCA / ShopeePay",
  qrisInstructions: "Scan QRIS di atas melalui m-Banking (BCA, Mandiri, BRI, BNI) atau e-Wallet (GoPay, OVO, DANA, ShopeePay).",
  paymentMode: "manual_qris" as "manual_qris" | "midtrans_auto" | "both",
};

const settingsSchema = z.object({
  appName: z.string().min(2).default(defaultSettings.appName),
  appTagline: z.string().default(defaultSettings.appTagline),
  supportEmail: z.string().email().default(defaultSettings.supportEmail),
  supportWhatsApp: z.string().default(defaultSettings.supportWhatsApp),
  currency: z.string().default("IDR"),
  timezone: z.string().default("Asia/Jakarta"),
  defaultTrialDays: z.number().int().min(1).max(90).default(14),
  maintenanceMode: z.boolean().default(false),
  allowNewRegistrations: z.boolean().default(true),
  require2FAForAdmins: z.boolean().default(false),
  whatsappGatewayEnabled: z.boolean().default(true),
  customQrisImageUrl: z.string().default(""),
  customQrisPayload: z.string().default(""),
  qrisAccountName: z.string().default("KEDAI-KU OFFICIAL"),
  qrisBankName: z.string().default("QRIS All Payment / GoPay / BCA / ShopeePay"),
  qrisInstructions: z.string().default("Scan QRIS di atas melalui m-Banking (BCA, Mandiri, BRI, BNI) atau e-Wallet (GoPay, OVO, DANA, ShopeePay)."),
  paymentMode: z.enum(["manual_qris", "midtrans_auto", "both"]).default("manual_qris"),
});

export const GET = apiHandler(async (request) => {
  const session = await requireSession(request.headers);
  if (!isSuperAdminEmail(session.user.email)) {
    throw new AppError("FORBIDDEN", "Akses ditolak: Hanya Super Admin");
  }

  const [row] = await db
    .select()
    .from(platformSettings)
    .where(eq(platformSettings.key, "general_config"))
    .limit(1);

  const config = row?.value ? { ...defaultSettings, ...(row.value as Record<string, unknown>) } : defaultSettings;

  return dataResponse({
    settings: config,
    superAdminEmails: getSuperAdminEmails(),
    currentAdmin: {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
    },
  });
});

export const POST = apiHandler(async (request) => {
  const session = await requireSession(request.headers);
  if (!isSuperAdminEmail(session.user.email)) {
    throw new AppError("FORBIDDEN", "Akses ditolak: Hanya Super Admin");
  }

  const input = await parseJson(request, settingsSchema);

  const [existing] = await db
    .select()
    .from(platformSettings)
    .where(eq(platformSettings.key, "general_config"))
    .limit(1);

  if (existing) {
    await db
      .update(platformSettings)
      .set({
        value: input,
        updatedAt: new Date(),
      })
      .where(eq(platformSettings.key, "general_config"));
  } else {
    await db.insert(platformSettings).values({
      key: "general_config",
      value: input,
    });
  }

  return dataResponse({
    success: true,
    settings: input,
    message: "Pengaturan platform berhasil diperbarui",
  });
});
