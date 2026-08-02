"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Building2, Loader2, Store } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { persistActiveContext } from "@/lib/client"

export default function OnboardingPage() {
  const router = useRouter()
  const [form, setForm] = useState({ businessName: "", slug: "", branchName: "Cabang Utama" })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  function update(field: keyof typeof form) {
    return (event: React.ChangeEvent<HTMLInputElement>) => setForm((current) => ({ ...current, [field]: event.target.value }))
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError(""); setLoading(true)
    try {
      const response = await fetch("/api/v1/onboarding", { method: "POST", headers: { "content-type": "application/json" }, credentials: "include", body: JSON.stringify(form) })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error?.message || "Gagal menyiapkan toko")
      persistActiveContext({ organizationId: payload.data.organization.id, branchId: payload.data.branch.id, warehouseId: payload.data.warehouse.id })
      router.replace("/dashboard")
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Gagal menyiapkan toko") }
    finally { setLoading(false) }
  }

  return <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4"><Card className="w-full max-w-lg shadow-xl"><CardHeader className="text-center"><span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"><Store className="size-7" /></span><CardTitle className="mt-4 text-2xl">Siapkan toko Anda</CardTitle><CardDescription>Lengkapi informasi dasar untuk mulai menggunakan Kasir-Ku.</CardDescription></CardHeader><CardContent><form onSubmit={submit} className="space-y-5">{error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}<div className="space-y-2"><Label htmlFor="businessName">Nama bisnis</Label><Input id="businessName" value={form.businessName} onChange={update("businessName")} placeholder="Kopi Senja" className="h-12" required minLength={2} /></div><div className="space-y-2"><Label htmlFor="slug">Alamat workspace</Label><div className="relative"><Input id="slug" value={form.slug} onChange={update("slug")} placeholder="kopi-senja" className="h-12 pr-28" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" /><span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">.kasir-ku.id</span></div></div><div className="space-y-2"><Label htmlFor="branchName">Nama cabang utama</Label><div className="relative"><Building2 className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input id="branchName" value={form.branchName} onChange={update("branchName")} className="h-12 pl-10" required /></div></div><Button className="h-12 w-full bg-emerald-600 hover:bg-emerald-700" disabled={loading}>{loading && <Loader2 className="animate-spin" />} {loading ? "Menyiapkan toko..." : "Lanjut ke dashboard"}</Button></form></CardContent></Card></main>
}
