import "server-only";
import { getServerEnv } from "@/config/env";
import { providerRequest, requireProviderConfig } from "./http";

export type PaymentRequest = {
  reference: string;
  amount: number;
  customerName: string;
  customerEmail?: string;
  description: string;
};

export type PaymentResult = {
  provider: "midtrans" | "xendit";
  externalId: string;
  paymentUrl?: string;
  token?: string;
  raw: unknown;
};

export async function createMidtransPayment(input: PaymentRequest): Promise<PaymentResult> {
  const env = getServerEnv();
  const config = requireProviderConfig("Midtrans", { serverKey: env.MIDTRANS_SERVER_KEY });
  const baseUrl = env.MIDTRANS_BASE_URL || "https://app.sandbox.midtrans.com";
  const result = await providerRequest<{ token: string; redirect_url: string }>("Midtrans", `${baseUrl}/snap/v1/transactions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Basic ${Buffer.from(`${config.serverKey}:`).toString("base64")}` },
    body: JSON.stringify({
      transaction_details: { order_id: input.reference, gross_amount: input.amount },
      customer_details: { first_name: input.customerName, email: input.customerEmail },
      item_details: [{ id: input.reference, price: input.amount, quantity: 1, name: input.description.slice(0, 50) }],
    }),
  });
  return { provider: "midtrans", externalId: input.reference, paymentUrl: result.redirect_url, token: result.token, raw: result };
}

export async function createXenditPayment(input: PaymentRequest): Promise<PaymentResult> {
  const env = getServerEnv();
  const config = requireProviderConfig("Xendit", { secretKey: env.XENDIT_SECRET_KEY });
  const result = await providerRequest<{ id: string; invoice_url: string }>("Xendit", "https://api.xendit.co/v2/invoices", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Basic ${Buffer.from(`${config.secretKey}:`).toString("base64")}` },
    body: JSON.stringify({ external_id: input.reference, amount: input.amount, payer_email: input.customerEmail, description: input.description }),
  });
  return { provider: "xendit", externalId: result.id, paymentUrl: result.invoice_url, raw: result };
}
