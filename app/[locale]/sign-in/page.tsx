"use client"

import { useState } from "react"
import { Link } from "@/i18n/navigation"
import { Chrome, Eye, EyeOff, Loader2, LockKeyhole, Mail } from "lucide-react"
import { useTranslations } from "next-intl"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AuthLayout } from "@/components/kasir/auth-layout"
import { signIn } from "@/lib/auth-client"
import { apiFetch, resolveAuthenticatedDestination } from "@/lib/client"
import { useRouter } from "@/i18n/navigation"
import { showSuccess } from "@/lib/toast-handler"

export default function SignInPage() {
  const t = useTranslations("SignIn")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const router = useRouter()

  async function social(provider: "google") {
    setError(""); setLoading(true)
    try {
      const result = await signIn.social({
        provider,
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
      console.error("Social sign-in error:", caught)
      setLoading(false)
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setLoading(true); setError("")
    try {
      const check = await apiFetch<{ registered: boolean }>("/api/v1/auth/check-email", { method: "POST", body: JSON.stringify({ email }) })
      if (!check.data.registered) { setError(t("unregistered")); return }
      const result = await signIn.email({ email, password })
      if (result.error) setError(result.error.message || t("wrongCredentials"))
      else { showSuccess(t("welcomeBack")); router.replace(await resolveAuthenticatedDestination()) }
    } catch { setError(t("connectionError")) }
    finally { setLoading(false) }
  }

  return <AuthLayout title={t("title")} description={t("description")}>
    <form onSubmit={submit} className="space-y-5">
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      <div className="space-y-2"><Label htmlFor="email">{t("email")}</Label><div className="relative"><Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input id="email" type="email" placeholder={t("emailPlaceholder")} value={email} onChange={(event) => setEmail(event.target.value)} className="h-12 pl-10" required disabled={loading} /></div></div>
      <div className="space-y-2"><div className="flex justify-between"><Label htmlFor="password">{t("password")}</Label><button type="button" className="text-xs font-medium text-emerald-600 hover:underline">{t("forgot")}</button></div><div className="relative"><LockKeyhole className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input id="password" type={showPassword ? "text" : "password"} placeholder={t("passwordPlaceholder")} value={password} onChange={(event) => setPassword(event.target.value)} className="h-12 px-10" required disabled={loading} /><Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1/2 size-9 -translate-y-1/2" onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</Button></div></div>
      <Button type="submit" className="h-12 w-full bg-emerald-600 text-base hover:bg-emerald-700" disabled={loading}>{loading && <Loader2 className="animate-spin" />}{loading ? t("processing") : t("submit")}</Button>
    </form>
    <div className="mt-5 flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" />{t("or")}<span className="h-px flex-1 bg-border" /></div>
    <Button type="button" variant="outline" className="mt-5 h-12 w-full text-base" onClick={() => void social("google")} disabled={loading}><Chrome className="size-5" /> {t("google")}</Button>
    <p className="mt-7 text-center text-sm text-muted-foreground">{t("noAccount")} <Link href="/sign-up" className="font-semibold text-emerald-600 hover:underline">{t("signUpLink")}</Link></p>
  </AuthLayout>
}