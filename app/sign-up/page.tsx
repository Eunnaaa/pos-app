"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Chrome, Eye, EyeOff, Loader2, LockKeyhole, Mail, UserRound } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AuthLayout } from "@/components/kasir/auth-layout"
import { signUp } from "@/lib/auth-client"
import { signIn } from "@/lib/auth-client"
import { apiFetch, resolveAuthenticatedDestination } from "@/lib/client"

export default function SignUpPage() {
  const [form, setForm] = useState({ name: "", email: "", password: "", confirm: "" })
  const [show, setShow] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const router = useRouter()

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError("")
    if (form.password.length < 12) return setError("Kata sandi minimal 12 karakter")
    if (form.password !== form.confirm) return setError("Konfirmasi kata sandi tidak sama")
    setLoading(true)
    try {
      const check = await apiFetch<{ registered: boolean }>("/api/v1/auth/check-email", { method: "POST", body: JSON.stringify({ email: form.email }) })
      if (check.data.registered) { setError("Akun sudah terdaftar. Silakan masuk dengan akun tersebut."); return }
      const result = await signUp.email({ name: form.name, email: form.email, password: form.password })
      if (result.error) setError(result.error.message || "Pendaftaran gagal")
      else router.replace(await resolveAuthenticatedDestination())
    } catch { setError("Tidak dapat terhubung. Periksa koneksi Anda.") }
    finally { setLoading(false) }
  }

  async function social() {
    setError(""); setLoading(true)
    try {
      const result = await signIn.social({ provider: "google", callbackURL: await resolveAuthenticatedDestination() })
      if (result.error) setError(result.error.message || "Gagal daftar dengan Google")
    } catch { setError("Tidak dapat terhubung. Periksa koneksi Anda.") }
    finally { setLoading(false) }
  }

  const update = (field: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) => setForm((current) => ({ ...current, [field]: event.target.value }))

  return <AuthLayout title="Mulai kelola bisnis" description="Buat akun Kasir-Ku gratis dalam beberapa langkah.">
    <form onSubmit={submit} className="space-y-4">
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      <div className="space-y-2"><Label htmlFor="name">Nama lengkap</Label><div className="relative"><UserRound className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input id="name" placeholder="Nama Anda" value={form.name} onChange={update("name")} className="h-12 pl-10" minLength={2} required /></div></div>
      <div className="space-y-2"><Label htmlFor="email">Email bisnis</Label><div className="relative"><Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input id="email" type="email" placeholder="nama@bisnis.com" value={form.email} onChange={update("email")} className="h-12 pl-10" required /></div></div>
      <div className="space-y-2"><Label htmlFor="password">Kata sandi</Label><div className="relative"><LockKeyhole className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input id="password" type={show ? "text" : "password"} placeholder="Minimal 12 karakter" value={form.password} onChange={update("password")} className="h-12 px-10" required /><Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1/2 size-9 -translate-y-1/2" onClick={() => setShow(!show)}>{show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</Button></div></div>
      <div className="space-y-2"><Label htmlFor="confirm">Konfirmasi kata sandi</Label><Input id="confirm" type={show ? "text" : "password"} placeholder="Ulangi kata sandi" value={form.confirm} onChange={update("confirm")} className="h-12" required /></div>
      <label className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground"><input type="checkbox" required className="mt-0.5 size-4 accent-emerald-600" />Saya menyetujui Syarat Layanan dan Kebijakan Privasi Kasir-Ku.</label>
      <Button type="submit" className="h-12 w-full bg-emerald-600 text-base hover:bg-emerald-700" disabled={loading}>{loading && <Loader2 className="animate-spin" />}{loading ? "Membuat akun..." : "Buat akun gratis"}</Button>
    </form>
    <div className="mt-5 flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" />atau<span className="h-px flex-1 bg-border" /></div>
    <Button type="button" variant="outline" className="mt-5 h-12 w-full text-base" onClick={() => void social()} disabled={loading}><Chrome className="size-5" /> Daftar dengan Google</Button>
    <p className="mt-7 text-center text-sm text-muted-foreground">Sudah punya akun? <Link href="/sign-in" className="font-semibold text-emerald-600 hover:underline">Masuk</Link></p>
  </AuthLayout>
}
