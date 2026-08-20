"use client"

import { useCallback, useEffect, useState } from "react"
import QRCode from "qrcode"
import { Check, Copy, KeyRound, Loader2, Lock, Shield, ShieldAlert, ShieldCheck, Upload, User as UserIcon } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useTranslations } from "next-intl"
import { authClient } from "@/lib/auth-client"
import { apiFetch } from "@/lib/client"
import { showError, showSuccess } from "@/lib/toast-handler"

type UserProfile = {
  id: string
  name: string
  email: string
  emailVerified: boolean
  image: string | null
  locale: string
}

export function AccountTab() {
  const t = useTranslations("AccountTab")
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [savingProfile, setSavingProfile] = useState(false)
  const [form, setForm] = useState({ name: "", email: "", locale: "id-ID" })

  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [passwordForm, setPasswordForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" })
  const [savingPassword, setSavingPassword] = useState(false)

  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false)
  const [totpModal, setTotpModal] = useState(false)
  const [totpPassword, setTotpPassword] = useState("")
  const [qrCodeUrl, setQrCodeUrl] = useState("")
  const [totpSecret, setTotpSecret] = useState("")
  const [verifyCode, setVerifyCode] = useState("")
  const [backupCodes, setBackupCodes] = useState<string[]>([])
  const [disabling2FA, setDisabling2FA] = useState(false)
  const [copiedCodes, setCopiedCodes] = useState(false)
  const [step2FA, setStep2FA] = useState<"password" | "qr" | "codes">("password")
  const [enablingLoading, setEnablingLoading] = useState(false)

  const loadProfile = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiFetch<UserProfile>("/api/v1/settings/me")
      setProfile(res.data)
      setForm({
        name: res.data.name || "",
        email: res.data.email || "",
        locale: res.data.locale || "id-ID",
      })
    } catch (error) {
      showError(error instanceof Error ? error.message : t("profileLoadFailed"))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    void loadProfile()
  }, [loadProfile])

  useEffect(() => {
    void authClient.getSession().then((session) => {
      if (session?.data?.user) {
        setTwoFactorEnabled(Boolean((session.data.user as { twoFactorEnabled?: boolean }).twoFactorEnabled))
      }
    })
  }, [])

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault()
    setSavingProfile(true)
    try {
      const res = await apiFetch<{ emailStatus?: string }>("/api/v1/settings/me", {
        method: "PATCH",
        body: JSON.stringify(form),
      })
      if (res.data?.emailStatus === "pending") {
        showSuccess(t("verificationSent"))
      } else {
        showSuccess(t("profileSaved"))
      }
      await loadProfile()
    } catch (error) {
      showError(error instanceof Error ? error.message : t("profileSaveFailed"))
    } finally {
      setSavingProfile(false)
    }
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) {
      showError(t("avatarTooLarge"))
      return
    }
    setUploadingAvatar(true)
    try {
      const res = await fetch("/api/v1/settings/me/avatar", {
        method: "POST",
        headers: { "content-type": file.type },
        credentials: "include",
        body: await file.arrayBuffer(),
      })
      const payload = await res.json()
      if (!res.ok) throw new Error(payload.error?.message || t("avatarUploadFailed"))
      showSuccess(t("avatarUpdated"))
      await loadProfile()
    } catch (error) {
      showError(error instanceof Error ? error.message : t("avatarUploadFailed"))
    } finally {
      setUploadingAvatar(false)
    }
  }

  async function handleSavePassword(e: React.FormEvent) {
    e.preventDefault()
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      showError(t("passwordMismatch"))
      return
    }
    if (passwordForm.newPassword.length < 12) {
      showError(t("passwordTooShort"))
      return
    }
    setSavingPassword(true)
    try {
      const { error } = await authClient.changePassword({
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
        revokeOtherSessions: true,
      })
      if (error) throw new Error(error.message || t("passwordChangeFailed"))
      showSuccess(t("passwordChanged"))
      setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" })
    } catch (error) {
      showError(error instanceof Error ? error.message : t("passwordChangeFailed"))
    } finally {
      setSavingPassword(false)
    }
  }

  async function startEnable2FA(e: React.FormEvent) {
    e.preventDefault()
    setEnablingLoading(true)
    try {
      const { data, error } = await authClient.twoFactor.enable({
        password: totpPassword,
      })
      if (error) throw new Error(error.message || t("enable2faFailed"))
      if (data?.totpURI) {
        const qr = await QRCode.toDataURL(data.totpURI)
        setQrCodeUrl(qr)
        setTotpSecret(data.totpURI.split("secret=")[1]?.split("&")[0] || "")
        if (data.backupCodes) setBackupCodes(data.backupCodes)
        setStep2FA("qr")
      }
    } catch (error) {
      showError(error instanceof Error ? error.message : t("enable2faFailed"))
    } finally {
      setEnablingLoading(false)
    }
  }

  async function verify2FACode(e: React.FormEvent) {
    e.preventDefault()
    setEnablingLoading(true)
    try {
      const { data, error } = await authClient.twoFactor.verifyTotp({
        code: verifyCode,
      })
      if (error) throw new Error(error.message || t("verifyFailed"))
      if (data) {
        showSuccess(t("factorEnabled"))
        setTwoFactorEnabled(true)
        if (backupCodes.length > 0) {
          setStep2FA("codes")
        } else {
          closeTotpModal()
        }
      }
    } catch (error) {
      showError(error instanceof Error ? error.message : t("verifyFailed"))
    } finally {
      setEnablingLoading(false)
    }
  }

  async function disable2FA() {
    if (!confirm(t("disableConfirm"))) return
    const password = prompt(t("disablePasswordPrompt"))
    if (!password) return
    setDisabling2FA(true)
    try {
      const { error } = await authClient.twoFactor.disable({ password })
      if (error) throw new Error(error.message || t("disable2faFailed"))
      showSuccess(t("factorDisabled"))
      setTwoFactorEnabled(false)
    } catch (error) {
      showError(error instanceof Error ? error.message : t("disable2faFailed"))
    } finally {
      setDisabling2FA(false)
    }
  }

  function closeTotpModal() {
    setTotpModal(false)
    setStep2FA("password")
    setTotpPassword("")
    setVerifyCode("")
    setQrCodeUrl("")
    setTotpSecret("")
    setBackupCodes([])
  }

  if (loading) return <div className="p-8 text-center text-sm text-muted-foreground"><Loader2 className="mx-auto size-6 animate-spin text-emerald-600" /> {t("loading")}</div>
  if (!profile) return null

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><UserIcon className="size-5 text-emerald-600" /> {t("personalTitle")}</CardTitle>
          <CardDescription>{t("personalDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-col items-center gap-4 sm:flex-row">
            <Avatar className="size-20 border-2 border-muted">
              <AvatarImage src={profile.image || undefined} alt={profile.name} />
              <AvatarFallback className="bg-emerald-100 text-xl font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                {profile.name.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col items-center sm:items-start">
              <Label htmlFor="avatar-file" className="cursor-pointer">
                <span className="inline-flex items-center gap-1.5 rounded-lg border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted">
                  {uploadingAvatar ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
                  {uploadingAvatar ? t("uploading") : t("changePhoto")}
                </span>
              </Label>
              <Input id="avatar-file" type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={handleAvatarUpload} disabled={uploadingAvatar} />
              <p className="mt-1 text-xs text-muted-foreground">{t("photoHint")}</p>
            </div>
          </div>

          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="user-name">{t("fullName")}</Label>
                <Input id="user-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required minLength={2} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="user-email">{t("email")}</Label>
                <div className="relative">
                  <Input id="user-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
                  {profile.emailVerified ? (
                    <Badge variant="outline" className="absolute right-2.5 top-2.5 border-emerald-200 bg-emerald-50 text-[10px] text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">{t("verified")}</Badge>
                  ) : (
                    <Badge variant="outline" className="absolute right-2.5 top-2.5 border-amber-200 bg-amber-50 text-[10px] text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">{t("unverified")}</Badge>
                  )}
                </div>
              </div>
            </div>

            <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700" disabled={savingProfile}>
              {savingProfile ? <><Loader2 className="size-4 animate-spin" /> {t("saving")}</> : t("saveProfile")}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Lock className="size-5 text-emerald-600" /> {t("securityTitle")}</CardTitle>
          <CardDescription>{t("securityDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSavePassword} className="space-y-4 max-w-md">
            <div className="space-y-2">
              <Label htmlFor="current-password">{t("currentPassword")}</Label>
              <Input id="current-password" type="password" value={passwordForm.currentPassword} onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-password">{t("newPassword")}</Label>
              <Input id="new-password" type="password" value={passwordForm.newPassword} onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })} required minLength={12} placeholder={t("newPasswordPlaceholder")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">{t("confirmPassword")}</Label>
              <Input id="confirm-password" type="password" value={passwordForm.confirmPassword} onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })} required />
            </div>

            <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700" disabled={savingPassword}>
              {savingPassword ? <><Loader2 className="size-4 animate-spin" /> {t("changing")}</> : t("changePassword")}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Shield className="size-5 text-emerald-600" /> {t("twoFactorTitle")}</CardTitle>
          <CardDescription>{t("twoFactorDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-xl border p-4">
            <div className="flex items-center gap-3">
              {twoFactorEnabled ? <ShieldCheck className="size-8 text-emerald-600" /> : <ShieldAlert className="size-8 text-muted-foreground" />}
              <div>
                <p className="font-semibold">{twoFactorEnabled ? t("twoFactorActive") : t("twoFactorInactive")}</p>
                <p className="text-xs text-muted-foreground">{twoFactorEnabled ? t("twoFactorActiveDesc") : t("twoFactorInactiveDesc")}</p>
              </div>
            </div>

            {twoFactorEnabled ? (
              <Button variant="outline" className="text-destructive border-destructive/30 hover:bg-destructive/10" onClick={disable2FA} disabled={disabling2FA}>
                {disabling2FA ? <Loader2 className="size-4 animate-spin" /> : t("disable2fa")}
              </Button>
            ) : (
              <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => { setStep2FA("password"); setTotpModal(true) }}>
                {t("enable2fa")}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={totpModal} onOpenChange={closeTotpModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Shield className="size-5 text-emerald-600" /> {t("setupTitle")}</DialogTitle>
            <DialogDescription>
              {step2FA === "password" && t("setupPasswordDesc")}
              {step2FA === "qr" && t("setupQrDesc")}
              {step2FA === "codes" && t("setupCodesDesc")}
            </DialogDescription>
          </DialogHeader>

          {step2FA === "password" && (
            <form onSubmit={startEnable2FA} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="2fa-pass">{t("passwordFor2fa")}</Label>
                <Input id="2fa-pass" type="password" value={totpPassword} onChange={(e) => setTotpPassword(e.target.value)} required />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={closeTotpModal}>{t("cancel")}</Button>
                <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700" disabled={enablingLoading}>
                  {enablingLoading ? <Loader2 className="size-4 animate-spin" /> : t("continue")}
                </Button>
              </DialogFooter>
            </form>
          )}

          {step2FA === "qr" && (
            <form onSubmit={verify2FACode} className="space-y-4">
              <div className="flex flex-col items-center gap-3">
                {qrCodeUrl
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={qrCodeUrl} alt={t("qrAlt")} className="size-44 rounded-lg border p-2 bg-white" />
                  : <Loader2 className="size-8 animate-spin text-emerald-600" />}
                <p className="text-xs text-muted-foreground text-center">
                  {t("manualSecret")}<br />
                  <code className="rounded bg-muted px-2 py-1 font-mono text-[11px] select-all">{totpSecret}</code>
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="verify-code">{t("verifyCode")}</Label>
                <Input id="verify-code" placeholder={t("verifyCodePlaceholder")} maxLength={6} value={verifyCode} onChange={(e) => setVerifyCode(e.target.value)} required className="text-center font-mono text-lg tracking-widest" />
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={closeTotpModal}>{t("cancel")}</Button>
                <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700" disabled={enablingLoading || verifyCode.length < 6}>
                  {enablingLoading ? <Loader2 className="size-4 animate-spin" /> : t("verifyActivate")}
                </Button>
              </DialogFooter>
            </form>
          )}

          {step2FA === "codes" && (
            <div className="space-y-4">
              <Alert className="border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
                <KeyRound className="size-4" />
                <AlertTitle>{t("backupCodesTitle")}</AlertTitle>
                <AlertDescription className="text-xs">{t("backupCodesDesc")}</AlertDescription>
              </Alert>

              <div className="grid grid-cols-2 gap-2 rounded-xl border bg-muted/40 p-4 font-mono text-xs text-center">
                {backupCodes.map((code, idx) => (
                  <div key={idx} className="rounded bg-background p-1.5 border">{code}</div>
                ))}
              </div>

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => {
                  void navigator.clipboard.writeText(backupCodes.join("\n"))
                  setCopiedCodes(true)
                  setTimeout(() => setCopiedCodes(false), 2000)
                }}>
                  {copiedCodes ? <Check className="size-4 text-emerald-600" /> : <Copy className="size-4" />}
                  {copiedCodes ? t("copied") : t("copyAll")}
                </Button>
              </div>

              <DialogFooter>
                <Button className="bg-emerald-600 hover:bg-emerald-700 w-full" onClick={closeTotpModal}>{t("done")}</Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}