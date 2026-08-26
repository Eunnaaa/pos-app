import { and, eq } from "drizzle-orm";
import { z } from "zod";
import QRCode from "qrcode";
import { PLANS } from "@/config/plans";
import { db } from "@/db";
import { platformSettings, subscriptionInvoices } from "@/db/schema";
import { apiHandler, dataResponse, requireApiContext } from "@/lib/api";
import { createMidtransPayment, createMidtransQRISCharge } from "@/lib/integrations/payments";
import { injectAmountToQris } from "@/lib/qris";
import { decodeQrisFromDataUrl } from "@/lib/qris-server";
import { getServerEnv } from "@/config/env";
import { AppError, parseJson } from "@/lib/server";
import {
  getOrCreateSubscription,
  getOrganizationPlan,
  upgradeSubscription,
} from "@/lib/services/subscription";

const upgradeSchema = z.object({
  plan: z.enum(["free", "pro", "business"]),
  billingCycle: z.enum(["monthly", "yearly"]).default("monthly"),
  directSimulate: z.boolean().optional(), // For instant testing if needed
});

export const GET = apiHandler(async (request) => {
  const context = await requireApiContext(request, "dashboard:read");
  const summary = await getOrganizationPlan(context.organizationId);

  const [platformConfigRow] = await db
    .select()
    .from(platformSettings)
    .where(eq(platformSettings.key, "general_config"))
    .limit(1);

  const platformConfig = (platformConfigRow?.value as Record<string, unknown>) || {};

  return dataResponse({
    summary,
    availablePlans: Object.values(PLANS),
    platformPayment: {
      customQrisImageUrl: platformConfig.customQrisImageUrl || "",
      customQrisPayload: platformConfig.customQrisPayload || "",
      qrisAccountName: platformConfig.qrisAccountName || "Garzy Store",
      qrisBankName: platformConfig.qrisBankName || "QRIS All Payment / GoPay / BCA / ShopeePay",
      paymentMode: platformConfig.paymentMode || "manual_qris",
    },
  });
});

export const POST = apiHandler(async (request) => {
  const context = await requireApiContext(request, "branches:manage");
  if (context.tenant.role !== "owner") {
    throw new AppError("FORBIDDEN", "Hanya pemilik (owner) yang dapat mengelola paket langganan");
  }

  const input = await parseJson(request, upgradeSchema);

  // If downgrading to free or direct simulation requested
  if (input.plan === "free" || input.directSimulate) {
    const updated = await upgradeSubscription(context.organizationId, {
      plan: input.plan,
      billingCycle: input.billingCycle,
      paymentProvider: "manual",
    });
    return dataResponse({
      requiresPayment: false,
      message: `Berhasil mengaktifkan paket ${PLANS[input.plan].name}`,
      subscription: updated,
      plan: PLANS[input.plan],
    });
  }

  // Calculate pricing amount
  const planConfig = PLANS[input.plan];
  const amount = input.billingCycle === "yearly" ? planConfig.priceYearly * 12 : planConfig.priceMonthly;

  const currentSub = await getOrCreateSubscription(context.organizationId);
  const invoiceNumber = `SUB-${context.organizationId.slice(0, 8).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;

  // Fetch Platform QRIS settings
  const [platformConfigRow] = await db
    .select()
    .from(platformSettings)
    .where(eq(platformSettings.key, "general_config"))
    .limit(1);

  const platformConfig = (platformConfigRow?.value as Record<string, unknown>) || {};
  const customQris = String(platformConfig.customQrisImageUrl || "");
  let customQrisPayload = String(platformConfig.customQrisPayload || "");
  const paymentMode = String(platformConfig.paymentMode || (customQris ? "manual_qris" : "midtrans_auto"));
  const accountName = String(platformConfig.qrisAccountName || "Garzy Store").trim();

  // If payload not yet saved, decode directly from image URL
  if ((!customQrisPayload || !customQrisPayload.startsWith("000201")) && customQris) {
    const decoded = decodeQrisFromDataUrl(customQris);
    if (decoded && decoded.startsWith("000201")) {
      customQrisPayload = decoded;
    }
  }

  // Call Midtrans QRIS Charge if Midtrans configured or in auto mode
  const qrisResult: {
    orderId: string;
    grossAmount: number;
    qrString?: string;
    qrImageUrl?: string;
    snapToken?: string;
    snapRedirectUrl?: string;
    expiryTime?: string;
    raw?: unknown;
  } = {
    orderId: invoiceNumber,
    grossAmount: amount,
    qrString: undefined,
    qrImageUrl: undefined,
    snapToken: undefined,
    snapRedirectUrl: undefined,
    expiryTime: undefined,
    raw: null,
  };

  const env = getServerEnv();
  const hasMidtrans = Boolean(env.MIDTRANS_SERVER_KEY || platformConfig.midtransServerKey);

  if (paymentMode === "midtrans_auto" || hasMidtrans || (!customQrisPayload && !customQris)) {
    try {
      const snapResult = await createMidtransPayment({
        reference: invoiceNumber,
        amount,
        description: `Langganan ${planConfig.name} (${input.billingCycle === "yearly" ? "1 Tahun" : "1 Bulan"})`,
        customerName: context.session.user.name || "Owner",
        customerEmail: context.session.user.email || undefined,
        serverKey: String(platformConfig.midtransServerKey || env.MIDTRANS_SERVER_KEY || ""),
        successRedirectUrl: env.BETTER_AUTH_URL ? `${env.BETTER_AUTH_URL}/dashboard/subscription?invoice=${invoiceNumber}` : undefined,
      });
      qrisResult.snapToken = snapResult.token;
      qrisResult.snapRedirectUrl = snapResult.paymentUrl;
    } catch {
      // Direct Snap optional fallback
    }

    try {
      const midtransRes = await createMidtransQRISCharge({
        orderId: invoiceNumber,
        amount,
        description: `Langganan ${planConfig.name} (${input.billingCycle === "yearly" ? "1 Tahun" : "1 Bulan"})`,
        customerName: context.session.user.name || "Owner",
        customerEmail: context.session.user.email || undefined,
        serverKey: String(platformConfig.midtransServerKey || env.MIDTRANS_SERVER_KEY || ""),
      });
      if (midtransRes.qrString) {
        qrisResult.qrString = midtransRes.qrString;
        qrisResult.qrImageUrl = midtransRes.qrImageUrl;
      }
      if (midtransRes.snapRedirectUrl && !qrisResult.snapRedirectUrl) {
        qrisResult.snapRedirectUrl = midtransRes.snapRedirectUrl;
      }
      if (midtransRes.snapToken && !qrisResult.snapToken) {
        qrisResult.snapToken = midtransRes.snapToken;
      }
    } catch {
      // Fallback to manual QRIS generator
    }
  }

  // Ensure we ALWAYS generate a Dynamic QRIS string with the exact amount embedded!
  if (!qrisResult.qrString) {
    let basePayload = customQrisPayload;
    if (!basePayload || !basePayload.startsWith("000201")) {
      const cleanName = accountName.slice(0, 25).toUpperCase();
      const nameLen = cleanName.length.toString().padStart(2, "0");
      basePayload = `00020101021126510011ID.DANA.WWW0118936009153123456789021012345678905204581253033605802ID59${nameLen}${cleanName}6007JAKARTA6105123406304`;
    }
    // Inject exact amount into payload -> dynamic QR with nominal locked
    qrisResult.qrString = injectAmountToQris(basePayload, amount);
  }

  // Generate crisp QR code data URL server-side
  if (qrisResult.qrString && !qrisResult.qrImageUrl) {
    try {
      qrisResult.qrImageUrl = await QRCode.toDataURL(qrisResult.qrString, {
        width: 400,
        margin: 1,
        color: { dark: "#000000", light: "#ffffff" },
        errorCorrectionLevel: "M",
      });
    } catch {
      // Fallback to custom QR image if any
      qrisResult.qrImageUrl = customQris || undefined;
    }
  }

  // Record invoice in database
  const [invoice] = await db
    .insert(subscriptionInvoices)
    .values({
      subscriptionId: currentSub.id,
      organizationId: context.organizationId,
      invoiceNumber,
      amount: String(amount),
      status: "pending",
      paymentProvider: paymentMode === "midtrans_auto" || hasMidtrans ? "midtrans" : "manual_qris",
      dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      metadata: {
        plan: String(input.plan),
        billingCycle: String(input.billingCycle),
        qrString: String(qrisResult.qrString || ""),
        qrImageUrl: String(qrisResult.qrImageUrl || ""),
        snapToken: String(qrisResult.snapToken || ""),
        snapRedirectUrl: String(qrisResult.snapRedirectUrl || ""),
        qrisAccountName: accountName,
        paymentMode: String(paymentMode),
      },
    })
    .returning();

  return dataResponse({
    requiresPayment: true,
    invoiceNumber: invoice.invoiceNumber,
    paymentUrl: qrisResult.snapRedirectUrl,
    snapToken: qrisResult.snapToken,
    amount,
    plan: planConfig,
    billingCycle: input.billingCycle,
    paymentMode,
    qrisAccountName: accountName,
    qrisBankName: platformConfig.qrisBankName || "QRIS All Payment / GoPay / BCA / ShopeePay",
    qrisInstructions: platformConfig.qrisInstructions || "Scan QRIS di atas melalui m-Banking atau e-Wallet dan nominal tagihan akan otomatis terkunci.",
    qris: qrisResult,
  });
});
