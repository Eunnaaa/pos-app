"use client"

export const dynamic = "force-dynamic"

import { useState } from "react"
import { useSearchParams } from "next/navigation"
import { Eye, EyeOff, KeyRound, Loader2, LockKeyhole, ShieldCheck } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AuthLayout } from "@/components/kasir/auth-layout"
import { authClient } from "@/lib/auth-client"
import { useRouter } from "@/i18n/navigation"
import { showError, showSuccess } from "@/lib/toast-handler"

export default function ResetPasswordPage() {
  const searchParams = useSearchParams()
  const token = searchParams.get("token") || ""
  const errorParam = searchParams.get("error")
  const router = useRouter()

  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(errorParam || "")

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirmPassword) {
      setError("Konfirmasi kata sandi tidak cocok")
      return
    }
    if (password.length < 12) {
      setError("Kata sandi baru minimal 12 karakter")
      return
    }

    setLoading(true)
    setError("")
    try {
      const { error: resetErr } = await authClient.resetPassword({
        newPassword: password,
        token: token,
      })

      if (resetErr) {
        throw new Error(resetErr.message || "Tautan reset kata sandi tidak valid atau telah kedaluwarsa")
      }

      showSuccess("Kata sandi berhasil diperbarui! Silakan masuk.")
      router.replace("/sign-in")
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Gagal memperbarui kata sandi")
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout
      title="Atur Ulang Kata Sandi"
      description="Buat kata sandi baru untuk mengamankan akun Kedai-Ku Anda."
    >
      <form onSubmit={submit} className="space-y-5">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-2">
          <Label htmlFor="password">Kata Sandi Baru (Min. 12 Karakter)</Label>
          <div className="relative">
            <LockKeyhole className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              placeholder="Masukkan kata sandi baru"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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

        <div className="space-y-2">
          <Label htmlFor="confirmPassword">Konfirmasi Kata Sandi Baru</Label>
          <div className="relative">
            <LockKeyhole className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="confirmPassword"
              type={showPassword ? "text" : "password"}
              placeholder="Ulangi kata sandi baru"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="h-12 px-10"
              required
              disabled={loading}
            />
          </div>
        </div>

        <Button
          type="submit"
          className="h-12 w-full bg-emerald-600 text-base hover:bg-emerald-700 font-bold"
          disabled={loading || !token}
        >
          {loading && <Loader2 className="animate-spin mr-2 size-4" />}
          {loading ? "Menyimpan..." : "Simpan Kata Sandi Baru"}
        </Button>
      </form>
    </AuthLayout>
  )
}
