"use client"

export const dynamic = "force-dynamic"

import { useState } from "react"
import { Link } from "@/i18n/navigation"
import { Chrome, Eye, EyeOff, KeyRound, Loader2, LockKeyhole, Mail } from "lucide-react"
import { useTranslations } from "next-intl"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AuthLayout } from "@/components/kasir/auth-layout"
import { authClient, signIn } from "@/lib/auth-client"
import { resolveAuthenticatedDestination } from "@/lib/client"
import { useRouter } from "@/i18n/navigation"
import { showError, showSuccess } from "@/lib/toast-handler"

export default function SignInPage() {
  const t = useTranslations("SignIn")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const router = useRouter()

  // 2FA Verification State
  const [is2FA, setIs2FA] = useState(false)
  const [totpCode, setTotpCode] = useState("")
  const [isBackupCode, setIsBackupCode] = useState(false)
  const [verifying2FA, setVerifying2FA] = useState(false)

  // Forgot Password Modal State
  const [forgotModal, setForgotModal] = useState(false)
  const [forgotEmail, setForgotEmail] = useState("")
  const [resettingPassword, setResettingPassword] = useState(false)

  async function social(provider: "google") {
    setError("")
    setLoading(true)
    try {
      const callbackURL = typeof window !== "undefined" ? `${window.location.origin}/dashboard` : "/dashboard"
      const result = await signIn.social({
        provider,
        callbackURL,
      })
      if (result && "error" in result && result.error) {
        setError(result.error.message || "Google Sign-In belum dikonfigurasi di server. Silakan masuk menggunakan Email dan Password.")
        setLoading(false)
      }
    } catch (caught) {
      if (caught instanceof TypeError && caught.message.includes("Load failed")) {
        setError("Koneksi ke server gagal. Pastikan server dev aktif.")
        setLoading(false)
        return
      }
      setError("Google Sign-In memerlukan GOOGLE_CLIENT_ID di file .env. Silakan masuk dengan Email & Password.")
      setLoading(false)
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError("")
    try {
      const result = await signIn.email({ email, password })
      if (result.error) {
        setError(result.error.message || t("wrongCredentials"))
      } else if ((result.data as { twoFactorRedirect?: boolean })?.twoFactorRedirect) {
        setIs2FA(true)
      } else {
        showSuccess(t("welcomeBack"))
        router.replace(await resolveAuthenticatedDestination())
      }
    } catch {
      setError(t("connectionError"))
    } finally {
      setLoading(false)
    }
  }

  async function verify2FASubmit(e: React.FormEvent) {
    e.preventDefault()
    setVerifying2FA(true)
    setError("")
    try {
      if (isBackupCode) {
        const { data, error: err } = await authClient.twoFactor.verifyBackupCode({
          code: totpCode.trim(),
        })
        if (err) throw new Error(err.message || "Kode cadangan salah atau sudah pernah digunakan")
        if (data) {
          showSuccess(t("welcomeBack"))
          router.replace(await resolveAuthenticatedDestination())
        }
      } else {
        const { data, error: err } = await authClient.twoFactor.verifyTotp({
          code: totpCode.trim(),
        })
        if (err) throw new Error(err.message || "Kode TOTP 6 digit tidak valid atau kedaluwarsa")
        if (data) {
          showSuccess(t("welcomeBack"))
          router.replace(await resolveAuthenticatedDestination())
        }
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Verifikasi 2FA gagal")
    } finally {
      setVerifying2FA(false)
    }
  }

  async function handleResetPasswordSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!forgotEmail) {
      showError("Masukkan alamat email Anda")
      return
    }

    setResettingPassword(true)
    try {
      const redirectTo = typeof window !== "undefined" ? `${window.location.origin}/reset-password` : "/reset-password"
      const { error: err } = await authClient.requestPasswordReset({
        email: forgotEmail.trim(),
        redirectTo,
      })

      if (err) throw new Error(err.message || "Gagal mengirim tautan reset kata sandi")

      showSuccess("Tautan pemulihan kata sandi telah dikirim ke email Anda!")
      setForgotModal(false)
    } catch (caught) {
      showError(caught instanceof Error ? caught.message : "Gagal mengirim tautan pemulihan")
    } finally {
      setResettingPassword(false)
    }
  }

  if (is2FA) {
    return (
      <AuthLayout
        title="Verifikasi Dua Langkah (2FA)"
        description="Masukkan kode verifikasi 6 digit dari aplikasi Authenticator Anda untuk melanjutkan."
      >
        <form onSubmit={verify2FASubmit} className="space-y-5">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="totpCode">
              {isBackupCode ? "Kode Cadangan (Backup Code)" : "Kode Autentikasi (TOTP 6 Digit)"}
            </Label>
            <div className="relative">
              <KeyRound className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="totpCode"
                type="text"
                placeholder={isBackupCode ? "contoh: a1b2c3d4" : "000000"}
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value)}
                className="h-12 pl-10 tracking-widest font-mono text-center text-lg font-bold"
                required
                autoFocus
                disabled={verifying2FA}
              />
            </div>
          </div>

          <Button
            type="submit"
            className="h-12 w-full bg-emerald-600 text-base hover:bg-emerald-700 font-bold"
            disabled={verifying2FA}
          >
            {verifying2FA && <Loader2 className="animate-spin mr-2 size-4" />}
            {verifying2FA ? "Memverifikasi..." : "Verifikasi & Masuk"}
          </Button>

          <div className="flex items-center justify-between text-xs text-muted-foreground pt-2">
            <button
              type="button"
              onClick={() => {
                setIsBackupCode(!isBackupCode)
                setTotpCode("")
              }}
              className="text-emerald-600 hover:underline font-semibold"
            >
              {isBackupCode ? "Gunakan Google Authenticator" : "Gunakan Kode Cadangan (Backup Code)"}
            </button>
            <button
              type="button"
              onClick={() => {
                setIs2FA(false)
                setTotpCode("")
              }}
              className="hover:underline"
            >
              Batal
            </button>
          </div>
        </form>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title={t("title")} description={t("description")}>
      <form onSubmit={submit} className="space-y-5">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <div className="space-y-2">
          <Label htmlFor="email">{t("email")}</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="email"
              type="email"
              placeholder={t("emailPlaceholder")}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="h-12 pl-10"
              required
              disabled={loading}
            />
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex justify-between">
            <Label htmlFor="password">{t("password")}</Label>
            <button
              type="button"
              onClick={() => {
                setForgotEmail(email)
                setForgotModal(true)
              }}
              className="text-xs font-medium text-emerald-600 hover:underline"
            >
              {t("forgot")}
            </button>
          </div>
          <div className="relative">
            <LockKeyhole className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              placeholder={t("passwordPlaceholder")}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="h-12 px-10"
              required
              disabled={loading}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 size-9 -translate-y-1/2"
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </Button>
          </div>
        </div>
        <Button
          type="submit"
          className="h-12 w-full bg-emerald-600 text-base hover:bg-emerald-700 font-bold"
          disabled={loading}
        >
          {loading && <Loader2 className="animate-spin mr-2" />}
          {loading ? t("processing") : t("submit")}
        </Button>
      </form>

      <div className="mt-5 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        {t("or")}
        <span className="h-px flex-1 bg-border" />
      </div>
      <Button
        type="button"
        variant="outline"
        className="mt-5 h-12 w-full text-base"
        onClick={() => void social("google")}
        disabled={loading}
      >
        <Chrome className="size-5" /> {t("google")}
      </Button>
      <p className="mt-7 text-center text-sm text-muted-foreground">
        {t("noAccount")}{" "}
        <Link href="/sign-up" className="font-semibold text-emerald-600 hover:underline">
          {t("signUpLink")}
        </Link>
      </p>

      {/* Forgot Password Modal Dialog */}
      <Dialog open={forgotModal} onOpenChange={setForgotModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-lg bg-emerald-600 text-white shadow-xs">
                <KeyRound className="size-4" />
              </span>
              <DialogTitle className="text-lg font-bold">Lupa Kata Sandi?</DialogTitle>
            </div>
            <DialogDescription className="text-xs">
              Masukkan alamat email terdaftar akun Anda. Kami akan mengirimkan tautan aman untuk mengatur ulang kata sandi.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleResetPasswordSubmit} className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="forgotEmail" className="text-xs font-semibold">
                Alamat Email Akun
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="forgotEmail"
                  type="email"
                  placeholder="nama@bisnis.com"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  className="pl-10 h-11 text-xs"
                  required
                  autoFocus
                  disabled={resettingPassword}
                />
              </div>
            </div>

            <DialogFooter className="pt-2 gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setForgotModal(false)}
                disabled={resettingPassword}
              >
                Batal
              </Button>
              <Button
                type="submit"
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                disabled={resettingPassword}
              >
                {resettingPassword ? (
                  <Loader2 className="animate-spin size-3.5 mr-1.5" />
                ) : (
                  <Mail className="size-3.5 mr-1.5" />
                )}
                Kirim Tautan Reset
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AuthLayout>
  )
}
