import "dotenv/config"

const required = ["DATABASE_URL", "BETTER_AUTH_SECRET", "BETTER_AUTH_URL", "NEXT_PUBLIC_BETTER_AUTH_URL", "TRUSTED_ORIGINS"]
const errors: string[] = []

for (const key of required) if (!process.env[key]) errors.push(`${key} missing`)
if ((process.env.BETTER_AUTH_SECRET || "").length < 32) errors.push("BETTER_AUTH_SECRET must be at least 32 characters")
for (const key of ["BETTER_AUTH_URL", "NEXT_PUBLIC_BETTER_AUTH_URL"]) {
  const value = process.env[key]
  if (value) {
    try {
      const url = new URL(value)
      if (url.protocol !== "https:" && process.env.NODE_ENV === "production") errors.push(`${key} must use HTTPS in production`)
    } catch { errors.push(`${key} must be a valid URL`) }
  }
}

const providers = [
  ["Google", ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"]],
  ["Apple", ["APPLE_CLIENT_ID", "APPLE_CLIENT_SECRET"]],
  ["Midtrans", ["MIDTRANS_SERVER_KEY"]],
  ["Xendit", ["XENDIT_SECRET_KEY"]],
  ["WhatsApp", ["WHATSAPP_ACCESS_TOKEN"]],
  ["Telegram", ["TELEGRAM_BOT_TOKEN"]],
  ["Email", ["EMAIL_API_URL", "EMAIL_API_KEY"]],
  ["AI", ["AI_BASE_URL", "AI_API_KEY", "AI_MODEL"]],
] as const

for (const [name, keys] of providers) {
  const present = keys.filter((key) => Boolean(process.env[key])).length
  if (present > 0 && present < keys.length) errors.push(`${name} configuration incomplete`)
}

if (errors.length) {
  for (const error of errors) process.stderr.write(`ERROR: ${error}\n`)
  process.exitCode = 1
} else {
  process.stdout.write(`Production preflight passed. ${providers.filter(([, keys]) => keys.every((key) => Boolean(process.env[key]))).length} optional providers configured.\n`)
}
