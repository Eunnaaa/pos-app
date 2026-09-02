import "server-only";
import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { getServerEnv } from "@/config/env";
import { safeEqualSecret } from "@/lib/server/secrets";
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
  provider: "midtrans" | "xendit" | "doku";
  externalId: string;
  paymentUrl?: string;
  token?: string;
  raw: unknown;
};

export type XenditPaymentMethod = "QRIS" | "OVO" | "DANA" | "SHOPEEPAY" | "PAY_LATER";

export function verifyMidtransNotificationSignature(input: {
  orderId: string;
  statusCode: string;
  grossAmount: string;
  signature: string;
  serverKey: string;
}): boolean {
  const expected = createHash("sha512")
    .update(`${input.orderId}${input.statusCode}${input.grossAmount}${input.serverKey}`)
    .digest("hex");
  return safeEqualSecret(input.signature, expected);
}

export function parseGatewayAmount(value: unknown): bigint | undefined {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return BigInt(value);
  if (typeof value !== "string" || !/^\d+(?:\.0+)?$/.test(value)) return undefined;
  return BigInt(value.split(".", 1)[0]);
}

export function isOrderFullySettled(totalAmount: bigint, payments: ReadonlyArray<{ amount: bigint; status: string }>): boolean {
  const settledAmount = payments.reduce(
    (sum, payment) => payment.status === "settled" ? sum + payment.amount : sum,
    0n,
  );
  return settledAmount >= totalAmount;
}

export async function createMidtransPayment(input: PaymentRequest & { serverKey?: string }): Promise<PaymentResult> {
  const env = getServerEnv();
  const rawKey = input.serverKey?.trim() || env.MIDTRANS_SERVER_KEY?.trim() || "";
  const config = requireProviderConfig("Midtrans", { serverKey: rawKey });
  const serverKey = config.serverKey.trim();
  const isProductionKey = serverKey.startsWith("Mid-server-");
  const baseUrl = isProductionKey ? "https://app.midtrans.com" : "https://app.sandbox.midtrans.com";

  // Keep the provider order id stable. Retrying under a new id after an ambiguous
  // network failure can create two payable transactions for one local order.
  const result = await providerRequest<{ token: string; redirect_url: string }>("Midtrans", `${baseUrl}/snap/v1/transactions`, {
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
  // A direct QRIS charge and a Snap transaction are separate payable objects.
  // Only create Snap when direct QRIS creation failed.
  if (!qrString && !qrImageUrl) try {
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
  const failureRedirectUrl = input.successRedirectUrl
    ? `${input.successRedirectUrl}${input.successRedirectUrl.includes("?") ? "&" : "?"}status=failed`
    : undefined;
  const body: Record<string, unknown> = {
    external_id: input.reference,
    amount: input.amount,
    payer_email: payerEmail,
    description: input.description,
    success_redirect_url: input.successRedirectUrl,
    failure_redirect_url: failureRedirectUrl,
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

export function generateDokuDigest(jsonBody: string): string {
  return createHash("sha256").update(jsonBody).digest("base64");
}

export function generateDokuSignature(
  clientId: string,
  requestId: string,
  requestTimestamp: string,
  requestTarget: string,
  digest: string,
  secretKey: string,
): string {
  const component = `Client-Id:${clientId}\nRequest-Id:${requestId}\nRequest-Timestamp:${requestTimestamp}\nRequest-Target:${requestTarget}\nDigest:${digest}`;
  const hmac = createHmac("sha256", secretKey).update(component).digest("base64");
  return `HMACSHA256=${hmac}`;
}

export function verifyDokuSignature(
  clientId: string,
  requestId: string,
  requestTimestamp: string,
  requestTarget: string,
  digest: string,
  signatureHeader: string,
  secretKey: string,
): boolean {
  const expected = generateDokuSignature(clientId, requestId, requestTimestamp, requestTarget, digest, secretKey);
  const normalizedExpected = expected.replace(/^HMACSHA256=/, "");
  const normalizedSupplied = signatureHeader.replace(/^HMACSHA256=/, "");
  const expectedBuffer = Buffer.from(normalizedExpected, "base64");
  let suppliedBuffer: Buffer;
  try {
    suppliedBuffer = Buffer.from(normalizedSupplied, "base64");
  } catch {
    return false;
  }
  return suppliedBuffer.length === expectedBuffer.length && timingSafeEqual(suppliedBuffer, expectedBuffer);
}

export async function createDokuPayment(input: PaymentRequest & { clientId?: string; secretKey?: string }): Promise<PaymentResult> {
  const env = getServerEnv();
  const clientId = input.clientId?.trim() || env.DOKU_CLIENT_ID?.trim() || "";
  const secretKey = input.secretKey?.trim() || env.DOKU_SECRET_KEY?.trim() || "";
  const config = requireProviderConfig("DOKU", { clientId, secretKey });

  const baseUrl = env.DOKU_BASE_URL || "https://api.doku.com";
  const requestTarget = "/checkout/v1/payment";
  const requestId = randomUUID();
  const requestTimestamp = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

  const body = {
    order: {
      invoice_number: input.reference,
      amount: Math.round(input.amount),
      callback_url: input.successRedirectUrl || "https://kedai-ku.com",
      auto_redirect: true,
    },
    payment: {
      payment_due_date: 60,
    },
    customer: {
      id: input.reference,
      name: input.customerName || "Customer",
      email: input.customerEmail || "customer@kedai-ku.com",
    },
    additional_info: {
      override_notification_url: env.BETTER_AUTH_URL ? `${env.BETTER_AUTH_URL}/api/v1/integrations/payments/webhook` : undefined,
    },
  };

  const jsonBody = JSON.stringify(body);
  const digest = generateDokuDigest(jsonBody);
  const signature = generateDokuSignature(config.clientId, requestId, requestTimestamp, requestTarget, digest, config.secretKey);

  const result = await providerRequest<{
    response?: {
      payment?: {
        url?: string;
      };
      payment_url?: string;
      token?: string;
    };
    paymentUrl?: string;
  }>("DOKU", `${baseUrl}${requestTarget}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      "Client-Id": config.clientId,
      "Request-Id": requestId,
      "Request-Timestamp": requestTimestamp,
      Signature: signature,
    },
    body: jsonBody,
  });

  const paymentUrl = result.paymentUrl || result.response?.payment?.url || result.response?.payment_url;
  const token = result.response?.token;

  return {
    provider: "doku",
    externalId: input.reference,
    paymentUrl,
    token,
    raw: result,
  };
}

export async function createDokuQRISCharge(input: {
  orderId: string;
  amount: number;
  description: string;
  customerName: string;
  customerEmail?: string;
  clientId?: string;
  secretKey?: string;
}): Promise<QRISChargeResult> {
  const env = getServerEnv();
  const clientId = input.clientId?.trim() || env.DOKU_CLIENT_ID?.trim() || "";
  const secretKey = input.secretKey?.trim() || env.DOKU_SECRET_KEY?.trim() || "";
  const config = requireProviderConfig("DOKU", { clientId, secretKey });

  const baseUrl = env.DOKU_BASE_URL || "https://api.doku.com";
  const requestTarget = "/checkout/v1/payment";
  const requestId = randomUUID();
  const requestTimestamp = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

  const body = {
    order: {
      invoice_number: input.orderId,
      amount: Math.round(input.amount),
      callback_url: env.BETTER_AUTH_URL ? `${env.BETTER_AUTH_URL}/dashboard/subscription?invoice=${input.orderId}` : undefined,
      auto_redirect: true,
    },
    payment: {
      payment_due_date: 60,
    },
    customer: {
      id: input.orderId,
      name: input.customerName || "Customer",
      email: input.customerEmail || "customer@kedai-ku.com",
    },
    additional_info: {
      override_notification_url: env.BETTER_AUTH_URL ? `${env.BETTER_AUTH_URL}/api/v1/integrations/payments/webhook` : undefined,
    },
  };

  const jsonBody = JSON.stringify(body);
  const digest = generateDokuDigest(jsonBody);
  const signature = generateDokuSignature(config.clientId, requestId, requestTimestamp, requestTarget, digest, config.secretKey);

  let paymentUrl: string | undefined;
  let chargeRaw: unknown = null;

  try {
    const result = await providerRequest<{
      response?: {
        payment?: {
          url?: string;
        };
        payment_url?: string;
        token?: string;
      };
      paymentUrl?: string;
    }>("DOKU", `${baseUrl}${requestTarget}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        "Client-Id": config.clientId,
        "Request-Id": requestId,
        "Request-Timestamp": requestTimestamp,
        Signature: signature,
      },
      body: jsonBody,
    });

    chargeRaw = result;
    paymentUrl = result.paymentUrl || result.response?.payment?.url || result.response?.payment_url;
  } catch {
    // Handled by caller fallback
  }

  return {
    orderId: input.orderId,
    grossAmount: Math.round(input.amount),
    snapRedirectUrl: paymentUrl,
    raw: chargeRaw,
  };
}

export async function checkDokuTransactionStatus(
  invoiceNumber: string,
  customClientId?: string,
  customSecretKey?: string,
): Promise<{ status: "settled" | "pending" | "failed" | "not_found"; raw: unknown }> {
  const env = getServerEnv();
  const clientId = customClientId?.trim() || env.DOKU_CLIENT_ID?.trim() || "";
  const secretKey = customSecretKey?.trim() || env.DOKU_SECRET_KEY?.trim() || "";
  if (!clientId || !secretKey) return { status: "not_found", raw: null };

  const baseUrl = env.DOKU_BASE_URL || "https://api.doku.com";
  const requestTarget = `/orders/v1.0/status/${encodeURIComponent(invoiceNumber)}`;
  const requestId = randomUUID();
  const requestTimestamp = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const digest = "";
  const signature = generateDokuSignature(clientId, requestId, requestTimestamp, requestTarget, digest, secretKey);

  try {
    const res = await providerRequest<{
      transaction?: {
        status?: string;
      };
      status?: string;
      order?: {
        invoice_number?: string;
      };
    }>("DOKU", `${baseUrl}${requestTarget}`, {
      method: "GET",
      headers: {
        accept: "application/json",
        "Client-Id": clientId,
        "Request-Id": requestId,
        "Request-Timestamp": requestTimestamp,
        Signature: signature,
      },
    });

    const txStatus = (res.transaction?.status || res.status || "").toUpperCase();
    if (["SUCCESS", "PAID", "SETTLED"].includes(txStatus)) {
      return { status: "settled", raw: res };
    }
    if (["FAILED", "EXPIRED", "CANCELLED", "DENY"].includes(txStatus)) {
      return { status: "failed", raw: res };
    }
    return { status: "pending", raw: res };
  } catch {
    return { status: "not_found", raw: null };
  }
}
