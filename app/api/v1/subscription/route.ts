import { eq } from "drizzle-orm";
import { z } from "zod";
import QRCode from "qrcode";
import { PLANS } from "@/config/plans";
import { db } from "@/db";
import { platformSettings, subscriptionInvoices } from "@/db/schema";
import { apiHandler, dataResponse, requireApiContext } from "@/lib/api";
import {
  createDokuPayment,
  createMidtransPayment,
} from "@/lib/integrations/payments";
import { injectAmountToQris } from "@/lib/qris";
import { decodeQrisFromDataUrl } from "@/lib/qris-server";
import { getServerEnv } from "@/config/env";
import { AppError, decryptSecret, parseJson } from "@/lib/server";
import {
  getOrCreateSubscription,
  getOrganizationPlan,
  upgradeSubscription,
} from "@/lib/services/subscription";

const upgradeSchema = z.object({
  plan: z.enum(["free", "pro", "business"]),
  billingCycle: z.enum(["monthly", "yearly"]).default("monthly"),
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

  // Free-plan downgrade does not require a payment. Paid plans are only
  // activated by a verified payment event or an explicit super-admin action.
  if (input.plan === "free") {
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
    expiryTime: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    raw: null,
  };

  const env = getServerEnv();
  const hasDoku = Boolean(env.DOKU_CLIENT_ID && env.DOKU_SECRET_KEY);
  const midtransServerKey = decryptSecret(platformConfig.midtransServerKey || env.MIDTRANS_SERVER_KEY || "");
  const hasMidtrans = Boolean(midtransServerKey);
  let activeProvider = "manual_qris";

  if (hasDoku) {
    try {
      const dokuRes = await createDokuPayment({
        reference: invoiceNumber,
        amount,
        description: `Langganan ${planConfig.name} (${input.billingCycle === "yearly" ? "1 Tahun" : "1 Bulan"})`,
        customerName: context.session.user.name || "Owner",
        customerEmail: context.session.user.email || undefined,
        successRedirectUrl: env.BETTER_AUTH_URL ? `${env.BETTER_AUTH_URL}/dashboard/subscription?invoice=${invoiceNumber}` : undefined,
      });
      if (dokuRes.paymentUrl) {
        qrisResult.snapRedirectUrl = dokuRes.paymentUrl;
        qrisResult.snapToken = dokuRes.token;
        activeProvider = "doku";
      }
    } catch {
      // Fallback to Midtrans or QRIS
    }
  }

  if (!qrisResult.snapRedirectUrl && (paymentMode === "midtrans_auto" || hasMidtrans || (!customQrisPayload && !customQris))) {
    try {
      const snapResult = await createMidtransPayment({
        reference: invoiceNumber,
        amount,
        description: `Langganan ${planConfig.name} (${input.billingCycle === "yearly" ? "1 Tahun" : "1 Bulan"})`,
        customerName: context.session.user.name || "Owner",
        customerEmail: context.session.user.email || undefined,
        serverKey: midtransServerKey,
        successRedirectUrl: env.BETTER_AUTH_URL ? `${env.BETTER_AUTH_URL}/dashboard/subscription?invoice=${invoiceNumber}` : undefined,
      });
      qrisResult.snapToken = snapResult.token;
      qrisResult.snapRedirectUrl = snapResult.paymentUrl;
      activeProvider = "midtrans";
    } catch {
      // Direct Snap optional fallback
    }

  }

  // Ensure we ALWAYS generate a Dynamic QRIS string with the exact amount embedded!
  if (!qrisResult.qrString && customQrisPayload?.startsWith("000201")) {
    const basePayload = customQrisPayload;
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
      paymentProvider: activeProvider,
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
