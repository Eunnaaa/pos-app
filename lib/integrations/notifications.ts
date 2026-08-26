import "server-only";
import { getServerEnv } from "@/config/env";
import { AppError } from "@/lib/server";
import { providerRequest, requireProviderConfig } from "./http";

export async function sendWhatsApp(to: string, message: string) {
  const env = getServerEnv();
  const config = requireProviderConfig("Fonnte", { token: env.WHATSAPP_ACCESS_TOKEN });
  let target = to.replace(/[^0-9]/g, "");
  if (target.startsWith("0")) target = `62${target.slice(1)}`;
  const body = new URLSearchParams({ target, message, countryCode: "62" });
  let response: Response;
  try {
    response = await fetch("https://api.fonnte.com/send", {
      method: "POST",
      headers: { authorization: config.token, "content-type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new AppError("BAD_REQUEST", "Fonnte is unavailable", { details: { provider: "Fonnte" } });
  }
  const text = await response.text();
  let payload: unknown = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = text.slice(0, 1_000); }
  if (!response.ok) {
    const code = response.status === 429 ? "RATE_LIMITED" : response.status >= 500 ? "INTERNAL_ERROR" : "BAD_REQUEST";
    throw new AppError(code, "Fonnte send failed", { details: { provider: "Fonnte", status: response.status, response: payload } });
  }
  return payload;
}

export async function sendTelegram(chatId: string, message: string) {
  const env = getServerEnv();
  const config = requireProviderConfig("Telegram", { botToken: env.TELEGRAM_BOT_TOKEN });
  return providerRequest("Telegram", `https://api.telegram.org/bot${config.botToken}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: message }),
  });
}

export async function sendEmail(to: string, subject: string, html: string) {
  const env = getServerEnv();
  const config = requireProviderConfig("Email", { apiUrl: env.EMAIL_API_URL, apiKey: env.EMAIL_API_KEY });
  return providerRequest("Email", config.apiUrl, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify({ to, subject, html }),
  });
}

export async function sendWelcomeEmail(to: string, userName: string, businessName: string) {
  const env = getServerEnv();
  const subject = `Selamat Datang di Kedai-Ku POS, ${userName}! ☕🎉`;
  const baseUrl = env.BETTER_AUTH_URL || "http://localhost:3000";

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Selamat Datang di Kedai-Ku POS</title>
      </head>
      <body style="font-family: 'Segoe UI', Arial, sans-serif; background-color: #f4f7f6; margin: 0; padding: 24px; color: #1e293b;">
        <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.06);">
          <!-- Header Banner -->
          <tr>
            <td style="background: linear-gradient(135deg, #059669 0%, #0d9488 100%); padding: 36px 32px; text-align: center; color: #ffffff;">
              <h1 style="margin: 0; font-size: 26px; font-weight: 800; letter-spacing: -0.5px;">Kedai-Ku POS</h1>
              <p style="margin: 6px 0 0; font-size: 14px; color: #d1fae5; font-weight: 500;">Smart Point of Sale untuk Bisnis Modern</p>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td style="padding: 36px 32px;">
              <h2 style="margin: 0 0 12px; font-size: 20px; font-weight: 700; color: #0f172a;">Halo, ${userName}! 👋</h2>
              <p style="margin: 0 0 20px; font-size: 14px; line-height: 1.6; color: #475569;">
                Selamat! Akun bisnis <strong>${businessName}</strong> Anda telah resmi aktif. Kami sangat senang menyambut Anda di keluarga besar <strong>Kedai-Ku POS</strong>.
              </p>

              <!-- Trial Pro Badge Box -->
              <div style="background-color: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 12px; padding: 20px; margin-bottom: 28px;">
                <div style="font-size: 14px; font-weight: 700; color: #065f46; margin-bottom: 6px;">
                  🎁 Bonus Spesial: 14 Hari Masa Percobaan Pro Gratis Aktif!
                </div>
                <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #047857;">
                  Anda dapat langsung menikmati seluruh fitur unggulan: Transaksi Unlimited, Resep Bahan Baku (BOM), Export Laporan Excel/PDF, Self Order QR Meja, hingga AI Business Advisor.
                </p>
              </div>

              <!-- Quick Steps Guide -->
              <h3 style="margin: 0 0 14px; font-size: 14px; font-weight: 700; color: #1e293b; text-transform: uppercase; letter-spacing: 0.5px;">
                Langkah Cepat Memulai Operasional Toko:
              </h3>

              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 28px;">
                <tr>
                  <td style="padding: 10px 0; font-size: 13px; color: #334155; line-height: 1.5;">
                    <strong style="color: #059669;">1. Atur Menu & Varian Produk</strong><br>
                    Tambahkan katalog makanan, minuman, dan harga jual usaha Anda.
                  </td>
                </tr>
                <tr>
                  <td style="padding: 10px 0; font-size: 13px; color: #334155; line-height: 1.5;">
                    <strong style="color: #059669;">2. Buka Kasir & Mulai Transaksi</strong><br>
                    Gunakan antarmuka kasir cepat untuk melayani pesanan pertama Anda.
                  </td>
                </tr>
                <tr>
                  <td style="padding: 10px 0; font-size: 13px; color: #334155; line-height: 1.5;">
                    <strong style="color: #059669;">3. Download QR Meja Self-Order</strong><br>
                    Cetak kode QR meja agar pelanggan bisa langsung pesan dari ponsel.
                  </td>
                </tr>
              </table>

              <!-- Call to Action Button -->
              <div style="text-align: center; margin: 32px 0;">
                <a href="${baseUrl}/dashboard" style="background-color: #059669; color: #ffffff; padding: 14px 32px; font-size: 14px; font-weight: 700; border-radius: 8px; text-decoration: none; display: inline-block; box-shadow: 0 4px 10px rgba(5, 150, 105, 0.3);">
                  Buka Dashboard Toko Saya &rarr;
                </a>
              </div>

              <p style="margin: 0; font-size: 13px; line-height: 1.6; color: #64748b;">
                Jika Anda memiliki pertanyaan atau butuh bantuan saat setup toko, tim support kami selalu siap membantu.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 24px 32px; text-align: center; font-size: 12px; color: #94a3b8;">
              <p style="margin: 0 0 6px;">&copy; 2026 Kedai-Ku POS. Dibuat dengan bangga untuk kemajuan UMKM Indonesia.</p>
              <p style="margin: 0;">Email ini dikirim otomatis ke ${to} sehubungan dengan pendaftaran akun Kedai-Ku Anda.</p>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;

  try {
    if (env.EMAIL_API_URL && env.EMAIL_API_KEY) {
      await sendEmail(to, subject, html);
    }
  } catch (err) {
    console.warn("Welcome email failed to send:", err);
  }
}

export async function sendResetPasswordEmail(to: string, resetUrl: string) {
  const env = getServerEnv();
  const subject = "Permintaan Atur Ulang Kata Sandi — Kedai-Ku POS 🔐";

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Atur Ulang Kata Sandi</title>
      </head>
      <body style="font-family: 'Segoe UI', Arial, sans-serif; background-color: #f4f7f6; margin: 0; padding: 24px; color: #1e293b;">
        <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.06);">
          <tr>
            <td style="background: linear-gradient(135deg, #059669 0%, #0d9488 100%); padding: 32px; text-align: center; color: #ffffff;">
              <h1 style="margin: 0; font-size: 24px; font-weight: 800;">Kedai-Ku POS</h1>
              <p style="margin: 4px 0 0; font-size: 13px; color: #d1fae5;">Keamanan & Pemulihan Akun</p>
            </td>
          </tr>

          <tr>
            <td style="padding: 36px 32px;">
              <h2 style="margin: 0 0 12px; font-size: 18px; font-weight: 700; color: #0f172a;">Permintaan Reset Kata Sandi</h2>
              <p style="margin: 0 0 20px; font-size: 14px; line-height: 1.6; color: #475569;">
                Kami menerima permintaan untuk mengatur ulang kata sandi akun Kedai-Ku yang terhubung dengan email <strong>${to}</strong>.
              </p>

              <div style="text-align: center; margin: 32px 0;">
                <a href="${resetUrl}" style="background-color: #059669; color: #ffffff; padding: 14px 32px; font-size: 14px; font-weight: 700; border-radius: 8px; text-decoration: none; display: inline-block; box-shadow: 0 4px 10px rgba(5, 150, 105, 0.3);">
                  Atur Ulang Kata Sandi Sekarang &rarr;
                </a>
              </div>

              <div style="background-color: #fef3c7; border: 1px solid #fde68a; border-radius: 10px; padding: 16px; margin-bottom: 24px;">
                <p style="margin: 0; font-size: 12px; line-height: 1.5; color: #92400e;">
                  <strong>Penting:</strong> Tautan pemulihan ini hanya berlaku selama <strong>15 menit</strong>. Jika Anda tidak merasa meminta reset kata sandi, abaikan email ini dan akun Anda tetap aman.
                </p>
              </div>

              <p style="margin: 0; font-size: 12px; color: #94a3b8;">
                Atau salin tautan berikut ke peramban Anda:<br/>
                <a href="${resetUrl}" style="color: #059669; word-break: break-all;">${resetUrl}</a>
              </p>
            </td>
          </tr>

          <tr>
            <td style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 20px 32px; text-align: center; font-size: 11px; color: #94a3b8;">
              &copy; 2026 Kedai-Ku POS. Dibuat dengan bangga untuk UMKM Indonesia.
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;

  try {
    if (env.EMAIL_API_URL && env.EMAIL_API_KEY) {
      await sendEmail(to, subject, html);
    }
  } catch (err) {
    console.warn("Reset password email failed to send:", err);
  }
}

export async function sendSubscriptionSuccessEmail(
  to: string,
  params: {
    userName: string;
    businessName: string;
    planName: string;
    invoiceNumber: string;
    amount: number;
    billingCycle: string;
    periodEnd: Date;
  }
) {
  const env = getServerEnv();
  const subject = `Bukti Pembayaran Langganan ${params.planName} — Kedai-Ku POS 🧾👑`;
  const baseUrl = env.BETTER_AUTH_URL || "http://localhost:3000";

  const formattedAmount = new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(params.amount);

  const formattedDate = new Intl.DateTimeFormat("id-ID", {
    dateStyle: "long",
  }).format(params.periodEnd);

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Bukti Pembayaran Langganan Kedai-Ku</title>
      </head>
      <body style="font-family: 'Segoe UI', Arial, sans-serif; background-color: #f4f7f6; margin: 0; padding: 24px; color: #1e293b;">
        <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.06);">
          <tr>
            <td style="background: linear-gradient(135deg, #059669 0%, #0d9488 100%); padding: 32px; text-align: center; color: #ffffff;">
              <h1 style="margin: 0; font-size: 24px; font-weight: 800;">Kedai-Ku POS</h1>
              <p style="margin: 4px 0 0; font-size: 13px; color: #d1fae5;">Konfirmasi Pembayaran Langganan Resmi</p>
            </td>
          </tr>

          <tr>
            <td style="padding: 36px 32px;">
              <h2 style="margin: 0 0 8px; font-size: 18px; font-weight: 700; color: #0f172a;">Terima Kasih, ${params.userName}! 🎉</h2>
              <p style="margin: 0 0 24px; font-size: 14px; line-height: 1.6; color: #475569;">
                Pembayaran langganan untuk bisnis <strong>${params.businessName}</strong> telah berhasil diverifikasi via <strong>Midtrans QRIS</strong>. Paket Anda kini resmi aktif.
              </p>

              <!-- Invoice Receipt Summary Box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px; margin-bottom: 28px; font-size: 13px;">
                <tr>
                  <td style="padding: 6px 0; color: #64748b;">No. Tagihan:</td>
                  <td style="padding: 6px 0; text-align: right; font-family: monospace; font-weight: 700; color: #0f172a;">${params.invoiceNumber}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #64748b;">Paket Langganan:</td>
                  <td style="padding: 6px 0; text-align: right; font-weight: 700; color: #059669;">${params.planName}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #64748b;">Siklus Tagihan:</td>
                  <td style="padding: 6px 0; text-align: right; font-weight: 600; color: #0f172a;">${params.billingCycle === "yearly" ? "Tahunan (1 Tahun)" : "Bulanan (1 Bulan)"}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #64748b;">Status Pembayaran:</td>
                  <td style="padding: 6px 0; text-align: right; font-weight: 700; color: #059669;">LUNAS (Midtrans QRIS)</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #64748b;">Masa Aktif Sampai:</td>
                  <td style="padding: 6px 0; text-align: right; font-weight: 700; color: #0f172a;">${formattedDate}</td>
                </tr>
                <tr style="border-top: 1px solid #cbd5e1;">
                  <td style="padding: 12px 0 0; font-size: 14px; font-weight: 700; color: #0f172a;">Total Pembayaran:</td>
                  <td style="padding: 12px 0 0; text-align: right; font-size: 16px; font-weight: 800; color: #059669;">${formattedAmount}</td>
                </tr>
              </table>

              <div style="text-align: center; margin: 32px 0;">
                <a href="${baseUrl}/dashboard" style="background-color: #059669; color: #ffffff; padding: 14px 32px; font-size: 14px; font-weight: 700; border-radius: 8px; text-decoration: none; display: inline-block; box-shadow: 0 4px 10px rgba(5, 150, 105, 0.3);">
                  Buka Dashboard Toko Saya &rarr;
                </a>
              </div>

              <p style="margin: 0; font-size: 12px; line-height: 1.6; color: #94a3b8;">
                Bukti pembayaran ini sah dan diterbitkan secara elektronik oleh Kedai-Ku POS Indonesia.
              </p>
            </td>
          </tr>

          <tr>
            <td style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 20px 32px; text-align: center; font-size: 11px; color: #94a3b8;">
              &copy; 2026 Kedai-Ku POS. Terima kasih atas kepercayaan Anda bertumbuh bersama kami!
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;

  try {
    if (env.EMAIL_API_URL && env.EMAIL_API_KEY) {
      await sendEmail(to, subject, html);
    }
  } catch (err) {
    console.warn("Subscription email failed to send:", err);
  }
}
