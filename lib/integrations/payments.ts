import "server-only";
import { getServerEnv } from "@/config/env";
import { providerRequest, requireProviderConfig } from "./http";

export type PaymentRequest = {
  reference: string;
  amount: number;
  customerName: string;
  customerEmail?: string;
  description: string;
  /** Metode pembayaran Xendit opsional (QRIS/e-wallet). Undefined = biarkan Xendit pilih default. */
  paymentMethods?: readonly XenditPaymentMethod[];
  /** Slug organisasi untuk fallback payer_email bila customerEmail tidak diberikan. */
  organizationSlug?: string;
  successRedirectUrl?: string;
};

export type PaymentResult = {
  provider: "midtrans" | "xendit";
  externalId: string;
  paymentUrl?: string;
  token?: string;
  raw: unknown;
};

export type XenditPaymentMethod = "QRIS" | "OVO" | "DANA" | "SHOPEEPAY" | "PAY_LATER";

export async function createMidtransPayment(input: PaymentRequest & { serverKey?: string }): Promise<PaymentResult> {
  const env = getServerEnv();
  const rawKey = input.serverKey?.trim() || env.MIDTRANS_SERVER_KEY?.trim() || "";
  const config = requireProviderConfig("Midtrans", { serverKey: rawKey });
  const serverKey = config.serverKey.trim();
  const isProductionKey = serverKey.startsWith("Mid-server-");
  const baseUrl = isProductionKey ? "https://app.midtrans.com" : "https://app.sandbox.midtrans.com";

  let result: { token: string; redirect_url: string };
  try {
    result = await providerRequest<{ token: string; redirect_url: string }>("Midtrans", `${baseUrl}/snap/v1/transactions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "accept": "application/json",
        authorization: `Basic ${Buffer.from(`${serverKey}:`).toString("base64")}`,
      },
      body: JSON.stringify({
        transaction_details: { order_id: input.reference, gross_amount: Math.round(input.amount) },
        customer_details: { first_name: input.customerName || "Customer", email: input.customerEmail || "customer@self-order.local" },
        item_details: [{ id: input.reference, price: Math.round(input.amount), quantity: 1, name: input.description.slice(0, 50) }],
        callbacks: input.successRedirectUrl ? { finish: input.successRedirectUrl } : undefined,
      }),
    });
  } catch {
    // Retry with -retry suffix if exact order_id already exists in Midtrans
    result = await providerRequest<{ token: string; redirect_url: string }>("Midtrans", `${baseUrl}/snap/v1/transactions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "accept": "application/json",
        authorization: `Basic ${Buffer.from(`${serverKey}:`).toString("base64")}`,
      },
      body: JSON.stringify({
        transaction_details: { order_id: `${input.reference}-${Date.now().toString(36)}`, gross_amount: Math.round(input.amount) },
        customer_details: { first_name: input.customerName || "Customer", email: input.customerEmail || "customer@self-order.local" },
        item_details: [{ id: input.reference, price: Math.round(input.amount), quantity: 1, name: input.description.slice(0, 50) }],
        callbacks: input.successRedirectUrl ? { finish: input.successRedirectUrl } : undefined,
      }),
    });
  }
  return { provider: "midtrans", externalId: input.reference, paymentUrl: result.redirect_url, token: result.token, raw: result };
}

export type QRISChargeResult = {
  orderId: string;
  grossAmount: number;
  qrString?: string;
  qrImageUrl?: string;
  snapToken?: string;
  snapRedirectUrl?: string;
  expiryTime?: string;
  raw: unknown;
};

export async function createMidtransQRISCharge(input: {
  orderId: string;
  amount: number;
  description: string;
  customerName: string;
  customerEmail?: string;
  serverKey?: string;
}): Promise<QRISChargeResult> {
  const env = getServerEnv();
  const rawKey = input.serverKey?.trim() || env.MIDTRANS_SERVER_KEY?.trim() || "";
  const config = requireProviderConfig("Midtrans", { serverKey: rawKey });
  const serverKey = config.serverKey.trim();
  const isProductionKey = serverKey.startsWith("Mid-server-");
  const apiBaseUrl = isProductionKey ? "https://api.midtrans.com" : "https://api.sandbox.midtrans.com";
  const snapBaseUrl = isProductionKey ? "https://app.midtrans.com" : "https://app.sandbox.midtrans.com";

  let qrString: string | undefined;
  let qrImageUrl: string | undefined;
  let expiryTime: string | undefined;
  let chargeRaw: unknown = null;

  try {
    const chargeRes = await providerRequest<{
      status_code: string;
      status_message: string;
      qr_string?: string;
      actions?: { name: string; url: string; method?: string }[];
      expiry_time?: string;
    }>("Midtrans", `${apiBaseUrl}/v2/charge`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        authorization: `Basic ${Buffer.from(`${serverKey}:`).toString("base64")}`,
      },
      body: JSON.stringify({
        payment_type: "qris",
        transaction_details: {
          order_id: input.orderId,
          gross_amount: Math.round(input.amount),
        },
        item_details: [
          {
            id: input.orderId,
            price: Math.round(input.amount),
            quantity: 1,
            name: input.description.slice(0, 50),
          },
        ],
        customer_details: {
          first_name: input.customerName || "Owner",
          email: input.customerEmail || "owner@kedai-ku.com",
        },
        qris: {
          acquirer: "gopay",
        },
      }),
    });

    chargeRaw = chargeRes;
    qrString = chargeRes.qr_string;
    const qrAction = chargeRes.actions?.find((a) => a.name === "generate-qr-code");
    qrImageUrl = qrAction?.url;
    expiryTime = chargeRes.expiry_time;
  } catch {
    // If direct QR charge fails, snap token will serve as payment
  }

  let snapToken: string | undefined;
  let snapRedirectUrl: string | undefined;
  try {
    const snapRes = await providerRequest<{ token: string; redirect_url: string }>(
      "Midtrans",
      `${snapBaseUrl}/snap/v1/transactions`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          authorization: `Basic ${Buffer.from(`${serverKey}:`).toString("base64")}`,
        },
        body: JSON.stringify({
          transaction_details: {
            order_id: `${input.orderId}-snap`,
            gross_amount: Math.round(input.amount),
          },
          customer_details: {
            first_name: input.customerName || "Owner",
            email: input.customerEmail || "owner@kedai-ku.com",
          },
          item_details: [
            {
              id: input.orderId,
              price: Math.round(input.amount),
              quantity: 1,
              name: input.description.slice(0, 50),
            },
          ],
          enabled_payments: ["qris", "gopay", "shopeepay", "bca_va", "bni_va", "bri_va", "mandiri_va", "other_va"],
        }),
      },
    );
    snapToken = snapRes.token;
    snapRedirectUrl = snapRes.redirect_url;
  } catch {
    // Ignore snap error
  }

  return {
    orderId: input.orderId,
    grossAmount: Math.round(input.amount),
    qrString,
    qrImageUrl,
    snapToken,
    snapRedirectUrl,
    expiryTime,
    raw: chargeRaw,
  };
}

export async function checkMidtransTransactionStatus(
  orderId: string,
  customServerKey?: string,
): Promise<{ status: "settled" | "pending" | "failed" | "not_found"; raw: unknown }> {
  const env = getServerEnv();
  const rawKey = customServerKey?.trim() || env.MIDTRANS_SERVER_KEY?.trim() || "";
  if (!rawKey) return { status: "not_found", raw: null };

  const isProductionKey = rawKey.startsWith("Mid-server-");
  const apiBaseUrl = isProductionKey ? "https://api.midtrans.com" : "https://api.sandbox.midtrans.com";

  try {
    const res = await providerRequest<{
      status_code: string;
      transaction_status: string;
      fraud_status?: string;
      transaction_id?: string;
    }>("Midtrans", `${apiBaseUrl}/v2/${encodeURIComponent(orderId)}/status`, {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Basic ${Buffer.from(`${rawKey}:`).toString("base64")}`,
      },
    });

    if (["capture", "settlement"].includes(res.transaction_status)) {
      if (res.fraud_status && res.fraud_status !== "accept") {
        return { status: "pending", raw: res };
      }
      return { status: "settled", raw: res };
    }

    if (["deny", "cancel", "expire", "failure"].includes(res.transaction_status)) {
      return { status: "failed", raw: res };
    }

    return { status: "pending", raw: res };
  } catch {
    // If checking with snap suffix
    try {
      const res = await providerRequest<{
        status_code: string;
        transaction_status: string;
      }>("Midtrans", `${apiBaseUrl}/v2/${encodeURIComponent(`${orderId}-snap`)}/status`, {
        method: "GET",
        headers: {
          accept: "application/json",
          authorization: `Basic ${Buffer.from(`${rawKey}:`).toString("base64")}`,
        },
      });
      if (["capture", "settlement"].includes(res.transaction_status)) {
        return { status: "settled", raw: res };
      }
    } catch {
      // Ignore
    }
    return { status: "not_found", raw: null };
  }
}

export async function createXenditPayment(input: PaymentRequest): Promise<PaymentResult> {
  const env = getServerEnv();
  const config = requireProviderConfig("Xendit", { secretKey: env.XENDIT_SECRET_KEY });
  const payerEmail = input.customerEmail || (input.organizationSlug ? `guest@${input.organizationSlug}.local` : "guest@self-order.local");
  const body: Record<string, unknown> = {
    external_id: input.reference,
    amount: input.amount,
    payer_email: payerEmail,
    description: input.description,
    success_redirect_url: input.organizationSlug ? `https://${input.organizationSlug}.local/order/return?ref=${input.reference}` : undefined,
    failure_redirect_url: input.organizationSlug ? `https://${input.organizationSlug}.local/order/return?ref=${input.reference}&status=failed` : undefined,
  };
  if (input.paymentMethods && input.paymentMethods.length > 0) {
    body.payment_methods = Array.from(input.paymentMethods);
  }
  const result = await providerRequest<{ id: string; invoice_url: string }>("Xendit", "https://api.xendit.co/v2/invoices", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Basic ${Buffer.from(`${config.secretKey}:`).toString("base64")}` },
    body: JSON.stringify(body),
  });
  return { provider: "xendit", externalId: result.id, paymentUrl: result.invoice_url, raw: result };
}
