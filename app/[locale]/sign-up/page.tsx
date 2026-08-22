"use client"

export const dynamic = "force-dynamic"

import { useState } from "react"
import { Link } from "@/i18n/navigation"
import { useTranslations } from "next-intl"
import { Chrome, Eye, EyeOff, Loader2, LockKeyhole, Mail, MailCheck, UserRound } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AuthLayout } from "@/components/kasir/auth-layout"
import { signUp, sendVerificationEmail } from "@/lib/auth-client"
import { signIn } from "@/lib/auth-client"
import { apiFetch, resolveAuthenticatedDestination } from "@/lib/client"
import { useRouter } from "@/i18n/navigation"
import { showSuccess } from "@/lib/toast-handler"

export default function SignUpPage() {
  const t = useTranslations("SignUp")
  const [form, setForm] = useState({ name: "", email: "", password: "", confirm: "" })
  const [show, setShow] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [pendingVerification, setPendingVerification] = useState(false)
  const [resendStatus, setResendStatus] = useState("")
  const router = useRouter()

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError("")
    if (form.password.length < 12) return setError(t("passwordShort"))
    if (form.password !== form.confirm) return setError(t("confirmMismatch"))
    setLoading(true)
    try {
      const check = await apiFetch<{ registered: boolean }>("/api/v1/auth/check-email", { method: "POST", body: JSON.stringify({ email: form.email }) })
      if (check.data.registered) { setError(t("alreadyRegistered")); return }
      const result = await signUp.email({ name: form.name, email: form.email, password: form.password })
      if (result.error) { setError(result.error.message || t("registerFailed")); return }

      if (result.data && !result.data.token) {
        setPendingVerification(true)
      } else {
        showSuccess(t("accountCreated"))
        router.replace(await resolveAuthenticatedDestination())
      }
    } catch { setError(t("connectionError")) }
    finally { setLoading(false) }
  }

  async function resendVerification() {
    setResendStatus(""); setLoading(true)
    try {
      const result = await sendVerificationEmail({ email: form.email })
      if (result.error) setResendStatus(result.error.message || t("resendFailed"))
      else setResendStatus(t("resendSent"))
    } catch { setResendStatus(t("connectionError")) }
    finally { setLoading(false) }
  }

  async function social() {
    setError(""); setLoading(true)
    try {
      const result = await signIn.social({
        provider: "google",
        callbackURL: "/dashboard",
      })
      if (result && "error" in result && result.error) {
        setError(result.error.message || t("googleError"))
        setLoading(false)
      }
    } catch (caught) {
      if (caught instanceof TypeError && caught.message.includes("Load failed")) {
        setLoading(false)
        return
      }
      console.error("Social sign-up error:", caught)
      setLoading(false)
    }
  }

  const update = (field: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) => setForm((current) => ({ ...current, [field]: event.target.value }))

  return <AuthLayout title={t("title")} description={t("description")}>
    {pendingVerification ? (
      <div className="space-y-4 text-center">
        <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950"><MailCheck className="size-7 text-emerald-600" /></div>
        <div>
          <h3 className="text-lg font-semibold">{t("checkEmailTitle")}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{t("checkEmailDesc")} <strong>{form.email}</strong>.</p>
        </div>
        {resendStatus && <Alert><AlertDescription>{resendStatus}</AlertDescription></Alert>}
        <Button type="button" variant="outline" className="h-12 w-full" onClick={() => void resendVerification()} disabled={loading}>{loading && <Loader2 className="animate-spin" />}{t("resend")}</Button>
        <p className="text-sm text-muted-foreground">{t("alreadyVerified")} <Link href="/sign-in" className="font-semibold text-emerald-600 hover:underline">{t("signInHere")}</Link></p>
      </div>
    ) : (
      <>
        <form onSubmit={submit} className="space-y-4">
          {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
          <div className="space-y-2"><Label htmlFor="name">{t("name")}</Label><div className="relative"><UserRound className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input id="name" placeholder={t("namePlaceholder")} value={form.name} onChange={update("name")} className="h-12 pl-10" minLength={2} required /></div></div>
          <div className="space-y-2"><Label htmlFor="email">{t("email")}</Label><div className="relative"><Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input id="email" type="email" placeholder={t("emailPlaceholder")} value={form.email} onChange={update("email")} className="h-12 pl-10" required /></div></div>
          <div className="space-y-2"><Label htmlFor="password">{t("password")}</Label><div className="relative"><LockKeyhole className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input id="password" type={show ? "text" : "password"} placeholder={t("passwordPlaceholder")} value={form.password} onChange={update("password")} className="h-12 px-10" required /><Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1/2 size-9 -translate-y-1/2" onClick={() => setShow(!show)}>{show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</Button></div></div>
          <div className="space-y-2"><Label htmlFor="confirm">{t("confirm")}</Label><Input id="confirm" type={show ? "text" : "password"} placeholder={t("confirmPlaceholder")} value={form.confirm} onChange={update("confirm")} className="h-12" required /></div>
          <label className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground"><input type="checkbox" required className="mt-0.5 size-4 accent-emerald-600" />{t("agreePart1")} <Link href="/terms" className="font-semibold text-emerald-600 hover:underline">{t("agreeTerms")}</Link> {t("agreePart2")} <Link href="/privacy" className="font-semibold text-emerald-600 hover:underline">{t("agreePrivacy")}</Link> {t("agreeEnd")}</label>
          <Button type="submit" className="h-12 w-full bg-emerald-600 text-base hover:bg-emerald-700" disabled={loading}>{loading && <Loader2 className="animate-spin" />}{loading ? t("creating") : t("submit")}</Button>
        </form>
        <div className="mt-5 flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" />{t("or")}<span className="h-px flex-1 bg-border" /></div>
        <Button type="button" variant="outline" className="mt-5 h-12 w-full text-base" onClick={() => void social()} disabled={loading}><Chrome className="size-5" /> {t("google")}</Button>
        <p className="mt-7 text-center text-sm text-muted-foreground">{t("hasAccount")} <Link href="/sign-in" className="font-semibold text-emerald-600 hover:underline">{t("signInLink")}</Link></p>
      </>
    )}
  </AuthLayout>
}