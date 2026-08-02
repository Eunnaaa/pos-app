"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Eye, EyeOff, Loader2, LockKeyhole, Mail } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AuthLayout } from "@/components/kasir/auth-layout"
import { signIn } from "@/lib/auth-client"
import { resolveAuthenticatedDestination } from "@/lib/client"

export default function SignInPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const router = useRouter()

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setLoading(true); setError("")
    try {
      const result = await signIn.email({ email, password })
      if (result.error) setError(result.error.message || "Email atau kata sandi salah")
      else router.replace(await resolveAuthenticatedDestination())
    } catch { setError("Tidak dapat terhubung. Periksa koneksi Anda.") }
    finally { setLoading(false) }
  }

  return <AuthLayout title="Selamat datang kembali" description="Masuk ke akun Kasir-Ku Anda.">
    <form onSubmit={submit} className="space-y-5">
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      <div className="space-y-2"><Label htmlFor="email">Email</Label><div className="relative"><Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input id="email" type="email" placeholder="nama@bisnis.com" value={email} onChange={(event) => setEmail(event.target.value)} className="h-12 pl-10" required disabled={loading} /></div></div>
      <div className="space-y-2"><div className="flex justify-between"><Label htmlFor="password">Kata sandi</Label><button type="button" className="text-xs font-medium text-emerald-600 hover:underline">Lupa kata sandi?</button></div><div className="relative"><LockKeyhole className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input id="password" type={showPassword ? "text" : "password"} placeholder="Masukkan kata sandi" value={password} onChange={(event) => setPassword(event.target.value)} className="h-12 px-10" required disabled={loading} /><Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1/2 size-9 -translate-y-1/2" onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</Button></div></div>
      <Button type="submit" className="h-12 w-full bg-emerald-600 text-base hover:bg-emerald-700" disabled={loading}>{loading && <Loader2 className="animate-spin" />}{loading ? "Memproses..." : "Masuk"}</Button>
    </form>
    <p className="mt-7 text-center text-sm text-muted-foreground">Belum punya akun? <Link href="/sign-up" className="font-semibold text-emerald-600 hover:underline">Daftar gratis</Link></p>
  </AuthLayout>
}
