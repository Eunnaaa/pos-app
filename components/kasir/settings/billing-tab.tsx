"use client"

import { Check, CreditCard, Download, FileText, HelpCircle, ShieldCheck, Sparkles, Zap } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useOrganization } from "@/components/kasir/organization-provider"
import { showSuccess } from "@/lib/toast-handler"

const invoices = [
  { id: "INV-2026-08", date: "01 Agu 2026", amount: "Rp 350.000", status: "Lunas", plan: "Kedai-Ku Enterprise (Bulanan)" },
  { id: "INV-2026-07", date: "01 Jul 2026", amount: "Rp 350.000", status: "Lunas", plan: "Kedai-Ku Enterprise (Bulanan)" },
  { id: "INV-2026-06", date: "01 Jun 2026", amount: "Rp 350.000", status: "Lunas", plan: "Kedai-Ku Enterprise (Bulanan)" },
]

export function BillingTab() {
  const { organization } = useOrganization()
  const branchCount = organization?.branches?.length || 1

  return (
    <div className="space-y-6">
      {/* Current Subscription Banner */}
      <Card className="rounded-2xl border-emerald-200/80 bg-gradient-to-br from-emerald-50/50 via-background to-emerald-50/20 dark:border-emerald-900/50 dark:from-emerald-950/20 dark:to-background">
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-xs">
                <Sparkles className="size-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <CardTitle className="text-xl font-bold">Paket Kedai-Ku Enterprise</CardTitle>
                  <Badge className="bg-emerald-600 hover:bg-emerald-600 text-xs font-semibold">Aktif</Badge>
                </div>
                <CardDescription className="text-xs mt-0.5">
                  Langganan aktif untuk organisasi <strong>{organization?.name || "Bisnis Anda"}</strong>.
                </CardDescription>
              </div>
            </div>
            <div className="flex items-baseline gap-1 text-right">
              <span className="text-2xl font-bold text-foreground">Rp 350.000</span>
              <span className="text-xs text-muted-foreground">/ bulan</span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pt-0">
          <div className="grid gap-2 sm:grid-cols-2 pt-2 border-t text-xs">
            <div className="flex items-center gap-2">
              <Check className="size-4 text-emerald-600 shrink-0" />
              <span>Multi-Cabang &amp; Multi-Gudang ({branchCount} cabang aktif)</span>
            </div>
            <div className="flex items-center gap-2">
              <Check className="size-4 text-emerald-600 shrink-0" />
              <span>Kasir POS &amp; Perangkat Kasir Tanpa Batas</span>
            </div>
            <div className="flex items-center gap-2">
              <Check className="size-4 text-emerald-600 shrink-0" />
              <span>Kitchen Display System (KDS) &amp; Reservasi Meja</span>
            </div>
            <div className="flex items-center gap-2">
              <Check className="size-4 text-emerald-600 shrink-0" />
              <span>QR Self-Order &amp; Kiosk Restoran</span>
            </div>
            <div className="flex items-center gap-2">
              <Check className="size-4 text-emerald-600 shrink-0" />
              <span>AI Business Forecast &amp; Deteksi Kecurangan</span>
            </div>
            <div className="flex items-center gap-2">
              <Check className="size-4 text-emerald-600 shrink-0" />
              <span>Struk Otomatis WhatsApp (Fonnte) &amp; Email</span>
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex flex-wrap items-center justify-between gap-3 border-t bg-muted/20 px-6 py-3 rounded-b-2xl">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="size-4 text-emerald-600" />
            <span>Periode tagihan berikutnya: <strong>01 September 2026</strong></span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="text-xs rounded-xl h-8 font-semibold"
              onClick={() => showSuccess("Permintaan pergantian paket telah diteruskan ke tim support")}
            >
              Ganti Paket
            </Button>
            <Button
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs rounded-xl h-8 font-semibold gap-1.5"
              onClick={() => showSuccess("Faktur langganan terbaru dikirim ke email terdaftar")}
            >
              <Download className="size-3.5" /> Unduh Faktur
            </Button>
          </div>
        </CardFooter>
      </Card>

      {/* Usage Quotas */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="rounded-2xl">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs font-semibold text-muted-foreground">Transaksi POS Bulan Ini</CardTitle>
              <Zap className="size-4 text-amber-500" />
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-bold">1.420</span>
              <span className="text-xs text-muted-foreground font-medium">Unlimited</span>
            </div>
            <Progress value={25} className="h-1.5 bg-muted" />
            <p className="text-[11px] text-muted-foreground">Termasuk offline replay mutations</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs font-semibold text-muted-foreground">Penyimpanan Media &amp; Foto</CardTitle>
              <FileText className="size-4 text-blue-500" />
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-bold">2.4 GB</span>
              <span className="text-xs text-muted-foreground font-medium">dari 50 GB</span>
            </div>
            <Progress value={5} className="h-1.5 bg-muted" />
            <p className="text-[11px] text-muted-foreground">Supabase Storage CDN aktif</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs font-semibold text-muted-foreground">Metode Pembayaran Utama</CardTitle>
              <CreditCard className="size-4 text-emerald-600" />
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="flex size-7 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-950 font-bold text-[10px] text-emerald-800 dark:text-emerald-300">
                AUTO
              </div>
              <p className="text-sm font-semibold">QRIS / Debit Online</p>
            </div>
            <p className="text-[11px] text-muted-foreground">Auto-debet aktif via Midtrans Payment Gateway</p>
          </CardContent>
        </Card>
      </div>

      {/* Invoices History Table */}
      <Card className="rounded-2xl">
        <CardHeader className="border-b">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-bold">Riwayat Pembayaran &amp; Faktur</CardTitle>
              <CardDescription className="text-xs">
                Unduh bukti pembayaran resmi untuk keperluan pembukuan dan perpajakan Anda.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>No. Invoice</TableHead>
                <TableHead>Tanggal</TableHead>
                <TableHead>Deskripsi Paket</TableHead>
                <TableHead>Total Tagihan</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Faktur</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell className="font-mono text-xs font-bold text-emerald-700 dark:text-emerald-400">
                    {inv.id}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{inv.date}</TableCell>
                  <TableCell className="text-xs font-medium">{inv.plan}</TableCell>
                  <TableCell className="text-xs font-bold">{inv.amount}</TableCell>
                  <TableCell>
                    <Badge className="bg-emerald-600 text-[10px] font-semibold">{inv.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs gap-1 text-emerald-700 dark:text-emerald-400 font-semibold"
                      onClick={() => showSuccess(`Invoice ${inv.id} berhasil diunduh`)}
                    >
                      <Download className="size-3" /> Unduh PDF
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
