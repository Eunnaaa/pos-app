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
};

export type PaymentResult = {
  provider: "midtrans" | "xendit";
  externalId: string;
  paymentUrl?: string;
  token?: string;
  raw: unknown;
};

export type XenditPaymentMethod = "QRIS" | "OVO" | "DANA" | "SHOPEEPAY" | "PAY_LATER";

export async function createMidtransPayment(input: PaymentRequest): Promise<PaymentResult> {
  const env = getServerEnv();
  const config = requireProviderConfig("Midtrans", { serverKey: env.MIDTRANS_SERVER_KEY });
  const serverKey = config.serverKey.trim();
  const isProductionKey = serverKey.startsWith("Mid-server-");
  const baseUrl = isProductionKey ? "https://app.midtrans.com" : "https://app.sandbox.midtrans.com";

  const result = await providerRequest<{ token: string; redirect_url: string }>("Midtrans", `${baseUrl}/snap/v1/transactions`, {
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
      enabled_payments: [
        "qris",
        "gopay",
        "shopeepay",
        "bca_va",
        "bni_va",
        "bri_va",
        "mandiri_va",
        "permata_va",
        "other_va",
        "credit_card"
      ],
    }),
  });
  return { provider: "midtrans", externalId: input.reference, paymentUrl: result.redirect_url, token: result.token, raw: result };
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
