"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import QRCode from "qrcode"
import {
  AlertCircle,
  Building2,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  Loader2,
  PackageSearch,
  QrCode,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  UsersRound,
  X,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Progress } from "@/components/ui/progress"
import { apiFetch } from "@/lib/client"
import { showError, showSuccess } from "@/lib/toast-handler"
import { useOrganization } from "@/components/kasir/organization-provider"

interface PlanSummary {
  planId: "free" | "pro" | "business"
  plan: {
    id: string
    name: string
    badge: string
    description: string
    priceMonthly: number
    priceYearly: number
  }
  status: string
  isTrial: boolean
  trialDaysLeft: number
  trialEndsAt: string | null
  currentPeriodEnd: string | null
  billingCycle: "monthly" | "yearly"
  usage: {
    monthlyOrders: number
    maxMonthlyOrders: number
    products: number
    maxProducts: number
    branches: number
    maxBranches: number
    members: number
    maxMembers: number
    warehouses: number
    maxWarehouses: number
    historyDays: number
  }
  features: Record<string, boolean>
}

interface PlanItem {
  id: "free" | "pro" | "business"
  name: string
  badge: string
  description: string
  priceMonthly: number
  priceYearly: number
  limits: {
    maxMonthlyOrders: number
    maxProducts: number
    maxBranches: number
    maxMembers: number
    maxWarehouses: number
    historyDays: number
  }
  features: {
    recipeBOM: boolean
    exportReports: boolean
    whatsappRecap: boolean
    aiAdvisor: boolean
    watermarkFreeReceipt: boolean
    multiBranchTransfer: boolean
    promotionsAndDiscounts: boolean
    tableManagement: boolean
    selfOrderQR: boolean
  }
}

interface QRISModalData {
  invoiceNumber: string
  amount: number
  planName: string
  billingCycle: "monthly" | "yearly"
  qrString?: string
  qrImageUrl?: string
  snapRedirectUrl?: string
  qrisAccountName?: string
  qrisBankName?: string
  qrisInstructions?: string
  paymentMode?: string
  provider?: string
  expiryTime?: string
}

function rupiah(amount: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(amount)
}

function formatLimit(val: number | null | undefined, unit = "") {
  if (val === null || val === undefined || !Number.isFinite(val) || val < 0) {
    return "Unlimited"
  }
  return `${val} ${unit}`.trim()
}

function formatUsageMax(val: number | null | undefined) {
  if (val === null || val === undefined || !Number.isFinite(val) || val < 0) {
    return "∞"
  }
  return String(val)
}

function formatHistoryDays(val: number | null | undefined) {
  if (val === null || val === undefined || !Number.isFinite(val) || val < 0 || val >= 3650) {
    return "Selamanya"
  }
  return `${val} hari`
}

function calculateProgress(used: number, max: number | null | undefined) {
  if (max === null || max === undefined || !Number.isFinite(max) || max < 0) {
    return Math.min(100, Math.max(8, used * 2))
  }
  if (max === 0) return 100
  return Math.min(100, (used / max) * 100)
}

function useTrialCountdown(trialEndsAt: string | null | undefined) {
  const [formatted, setFormatted] = useState<string>("")

  useEffect(() => {
    if (!trialEndsAt) {
      setFormatted("")
      return
    }

    function update() {
      const diff = new Date(trialEndsAt!).getTime() - Date.now()
      if (diff <= 0) {
        setFormatted("Telah Berakhir")
        return
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24))
      const hours = Math.floor((diff / (1000 * 60 * 60)) % 24)
      const minutes = Math.floor((diff / (1000 * 60)) % 60)
      const seconds = Math.floor((diff / 1000) % 60)

      if (days > 0) {
        setFormatted(`${days} hari ${hours} jam ${minutes} menit`)
      } else if (hours > 0) {
        setFormatted(`${hours} jam ${minutes} menit ${seconds} dtk`)
      } else {
        setFormatted(`${minutes} menit ${seconds} dtk`)
      }
    }

    update()
    const timer = setInterval(update, 1000)
    return () => clearInterval(timer)
  }, [trialEndsAt])

  return formatted
}

export function SubscriptionPage() {
  const { organization } = useOrganization()
  const [summary, setSummary] = useState<PlanSummary | null>(null)
  const [plans, setPlans] = useState<PlanItem[]>([])
  const [loading, setLoading] = useState(true)
  const [upgrading, setUpgrading] = useState<string | null>(null)
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("monthly")
  const trialCountdown = useTrialCountdown(summary?.trialEndsAt)
  const subscriptionCountdown = useTrialCountdown(summary?.currentPeriodEnd)

  // QRIS Payment Modal State
  const [qrisModal, setQrisModal] = useState<QRISModalData | null>(null)
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>("")
  const [isPaidSuccess, setIsPaidSuccess] = useState(false)
  const [isCheckingPayment, setIsCheckingPayment] = useState(false)
  const paymentCountdown = useTrialCountdown(qrisModal?.expiryTime)
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null)

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      const res = await apiFetch<{ summary: PlanSummary; availablePlans: PlanItem[] }>("/api/v1/subscription")
      setSummary(res.data.summary)
      setPlans(res.data.availablePlans)
      if (res.data.summary.billingCycle) {
        setBillingCycle(res.data.summary.billingCycle)
      }
    } catch (caught) {
      showError(caught instanceof Error ? caught.message : "Gagal memuat informasi paket")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
    if (typeof window !== "undefined") {
      const sp = new URLSearchParams(window.location.search)
      const invoice = sp.get("invoice") || sp.get("order_id")
      if (invoice) {
        void (async () => {
          try {
            const check = await apiFetch<{ isPaid: boolean }>(`/api/v1/subscription/invoices/${invoice}`)
            if (check.data.isPaid) {
              showSuccess("🎉 Pembayaran Berhasil! Paket langganan Anda telah aktif!")
              await loadData()
            }
          } catch {
            // silent
          }
        })()
      }
    }
  }, [loadData])

  // Generate QR Code data URL when QRIS modal opens
  useEffect(() => {
    if (!qrisModal) {
      setQrCodeDataUrl("")
      setIsPaidSuccess(false)
      if (pollTimerRef.current) clearInterval(pollTimerRef.current)
      return
    }

    if (qrisModal.qrImageUrl && qrisModal.qrImageUrl.startsWith("data:image")) {
      setQrCodeDataUrl(qrisModal.qrImageUrl)
    } else if (qrisModal.qrString) {
      void QRCode.toDataURL(qrisModal.qrString, {
        width: 360,
        margin: 1,
        color: { dark: "#000000", light: "#ffffff" },
        errorCorrectionLevel: "M",
      }).then(setQrCodeDataUrl).catch(() => {
        if (qrisModal.qrImageUrl) setQrCodeDataUrl(qrisModal.qrImageUrl)
      })
    } else if (qrisModal.qrImageUrl) {
      setQrCodeDataUrl(qrisModal.qrImageUrl)
    } else {
      // Fallback QR code pointing to payment link
      const fallbackUrl = qrisModal.snapRedirectUrl || `https://app.midtrans.com/snap/v2/vtweb/${qrisModal.invoiceNumber}`
      void QRCode.toDataURL(fallbackUrl, { width: 360, margin: 1, errorCorrectionLevel: "M" }).then(setQrCodeDataUrl)
    }

    // Auto-poll invoice status every 3 seconds
    const interval = setInterval(async () => {
      try {
        const check = await apiFetch<{ isPaid: boolean }>(`/api/v1/subscription/invoices/${qrisModal.invoiceNumber}`)
        if (check.data.isPaid) {
          setIsPaidSuccess(true)
          clearInterval(interval)
          showSuccess("🎉 Pembayaran Berhasil! Paket langganan Anda telah aktif!")
          await loadData()
          setTimeout(() => {
            setQrisModal(null)
          }, 2500)
        }
      } catch {
        // Continue polling quietly
      }
    }, 3000)

    pollTimerRef.current = interval

    return () => {
      clearInterval(interval)
    }
  }, [qrisModal, loadData])

  async function handleUpgrade(planId: "free" | "pro" | "business") {
    if (planId === summary?.planId && !summary.isTrial) return
    try {
      setUpgrading(planId)

      if (planId === "free") {
        const res = await apiFetch<{ message: string }>("/api/v1/subscription", {
          method: "POST",
          body: JSON.stringify({ plan: planId, billingCycle }),
        })
        showSuccess(res.data.message || "Paket Starter aktif.")
        await loadData()
        return
      }

      // Paid plans: Pro or Business -> Generate Midtrans Direct Payment
      const res = await apiFetch<{
        requiresPayment: boolean
        invoiceNumber: string
        paymentUrl?: string
        snapToken?: string
        amount: number
        plan: PlanItem
        billingCycle: "monthly" | "yearly"
        paymentMode?: string
        qrisAccountName?: string
        qrisBankName?: string
        qrisInstructions?: string
        qris: {
          qrString?: string
          qrImageUrl?: string
          snapRedirectUrl?: string
          expiryTime?: string
        }
      }>("/api/v1/subscription", {
        method: "POST",
        body: JSON.stringify({ plan: planId, billingCycle }),
      })

      if (res.data.requiresPayment) {
        const snapUrl = res.data.paymentUrl || res.data.qris?.snapRedirectUrl
        if (res.data.qris?.qrImageUrl) {
          setQrCodeDataUrl(res.data.qris.qrImageUrl)
        }
        const isDoku = Boolean(res.data.paymentUrl?.includes("doku") || res.data.paymentMode === "doku")
        setQrisModal({
          invoiceNumber: res.data.invoiceNumber,
          amount: res.data.amount,
          planName: res.data.plan.name,
          billingCycle: res.data.billingCycle,
          qrString: res.data.qris?.qrString,
          qrImageUrl: res.data.qris?.qrImageUrl,
          snapRedirectUrl: snapUrl,
          qrisAccountName: res.data.qrisAccountName,
          qrisBankName: res.data.qrisBankName,
          qrisInstructions: res.data.qrisInstructions,
          paymentMode: res.data.paymentMode,
          provider: isDoku ? "doku" : res.data.paymentMode || "midtrans",
          expiryTime: res.data.qris?.expiryTime,
        })
      }
    } catch (caught) {
      showError(caught instanceof Error ? caught.message : "Gagal memproses pembayaran langganan")
    } finally {
      setUpgrading(null)
    }
  }

  async function checkManualPaymentStatus() {
    if (!qrisModal) return
    try {
      setIsCheckingPayment(true)
      const check = await apiFetch<{ isPaid: boolean }>(`/api/v1/subscription/invoices/${qrisModal.invoiceNumber}`)
      if (check.data.isPaid) {
        setIsPaidSuccess(true)
        showSuccess("🎉 Pembayaran Berhasil! Paket telah aktif!")
        await loadData()
        setTimeout(() => {
          setQrisModal(null)
        }, 2000)
      } else {
        showError("Pembayaran belum terdeteksi. Silakan selesaikan scan QRIS Anda.")
      }
    } catch {
      showError("Gagal memeriksa status pembayaran.")
    } finally {
      setIsCheckingPayment(false)
    }
  }

  if (loading || !summary) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-emerald-600" />
      </div>
    )
  }

  const isOwner = !organization || organization.role === "owner"

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6 w-full">
      {/* Header & Status Banner */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">Paket & Langganan</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Kelola kapasitas bisnis dan fitur unggulan Kedai-Ku untuk outlet Anda.
            </p>
          </div>
          <div className="flex items-center gap-2 bg-muted p-1.5 rounded-xl border border-border">
            <button
              type="button"
              onClick={() => setBillingCycle("monthly")}
              className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all ${
                billingCycle === "monthly" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Bulanan
            </button>
            <button
              type="button"
              onClick={() => setBillingCycle("yearly")}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg transition-all ${
                billingCycle === "yearly" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <span>Tahunan</span>
              <span className="text-[10px] font-bold bg-emerald-600 text-white px-1.5 py-0.5 rounded-full">
                Hemat 20%
              </span>
            </button>
          </div>
        </div>

        {/* Trial or Active Status Alert */}
        {summary.isTrial ? (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-amber-500/15 border border-amber-500/30 text-amber-900 dark:text-amber-200">
            <div className="flex items-center gap-3">
              <Sparkles className="size-5 text-amber-600 dark:text-amber-400 shrink-0" />
              <div className="text-sm">
                <span className="font-bold">Masa Percobaan Pro Gratis Aktif:</span> Anda sedang menikmati semua fitur Pro. Sisa waktu:{" "}
                <span className="font-extrabold font-mono tracking-tight bg-amber-500/20 px-2 py-0.5 rounded-md text-amber-950 dark:text-amber-100 border border-amber-500/30 inline-block my-0.5">
                  {trialCountdown || `${summary.trialDaysLeft} hari`}
                </span>
                {summary.trialEndsAt && (
                  <span className="text-xs text-muted-foreground ml-1.5">
                    (berakhir {new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(summary.trialEndsAt))})
                  </span>
                )}
                . Upgrade sekarang untuk menjaga fitur tetap aktif.
              </div>
            </div>
            {isOwner && (
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold shrink-0 shadow-md shadow-emerald-600/20 self-start sm:self-center"
                onClick={() => handleUpgrade("pro")}
                disabled={upgrading !== null}
              >
                Kunci Paket Pro
              </Button>
            )}
          </div>
        ) : summary.planId === "free" ? (
          <div className="flex items-center gap-3 p-4 rounded-xl bg-muted/60 border border-border text-foreground">
            <AlertCircle className="size-5 text-muted-foreground shrink-0" />
            <div className="flex-1 text-sm">
              Anda sedang menggunakan <span className="font-semibold">Starter (Free)</span> dengan kapasitas 100 transaksi/bulan dan 1 cabang.
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3 p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-500/30 text-emerald-900 dark:text-emerald-200 sm:flex-row sm:items-center">
            <ShieldCheck className="size-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <div className="flex-1 text-sm">
              <div>Status langganan: <span className="font-bold">{summary.plan.name}</span> aktif.</div>
              {summary.currentPeriodEnd && (
                <div className="mt-1 text-xs text-emerald-800/80 dark:text-emerald-200/80">
                  Berakhir {new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(summary.currentPeriodEnd))}
                </div>
              )}
            </div>
            {summary.currentPeriodEnd && (
              <div className="shrink-0 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-center" aria-live="polite">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">Sisa masa aktif</div>
                <div className="font-mono text-sm font-extrabold tracking-tight">{subscriptionCountdown || "Menghitung…"}</div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Usage Meter Card for Current Plan */}
      <Card className="shadow-sm border-border">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Penggunaan Kapasitas Bulan Ini</CardTitle>
              <CardDescription>Pemantauan kuota berdasarkan paket aktif Anda.</CardDescription>
            </div>
            <Badge variant="outline" className="text-xs font-semibold px-2.5 py-1 uppercase tracking-wider">
              {summary.isTrial ? "Trial Pro" : summary.plan.name}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {/* Orders Usage */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-1.5 text-muted-foreground font-medium">
                <ReceiptText className="size-4 text-emerald-600" /> Transaksi
              </span>
              <span className="font-bold">
                {summary.usage.monthlyOrders} / {formatUsageMax(summary.usage.maxMonthlyOrders)}
              </span>
            </div>
            <Progress
              value={calculateProgress(summary.usage.monthlyOrders, summary.usage.maxMonthlyOrders)}
              className="h-2"
            />
            <p className="text-[11px] text-muted-foreground">Reset setiap awal bulan</p>
          </div>

          {/* Products Usage */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-1.5 text-muted-foreground font-medium">
                <PackageSearch className="size-4 text-blue-600" /> Produk
              </span>
              <span className="font-bold">
                {summary.usage.products} / {formatUsageMax(summary.usage.maxProducts)}
              </span>
            </div>
            <Progress
              value={calculateProgress(summary.usage.products, summary.usage.maxProducts)}
              className="h-2"
            />
            <p className="text-[11px] text-muted-foreground">Katalog menu & varian</p>
          </div>

          {/* Branches Usage */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-1.5 text-muted-foreground font-medium">
                <Building2 className="size-4 text-violet-600" /> Cabang
              </span>
              <span className="font-bold">
                {summary.usage.branches} / {summary.usage.maxBranches}
              </span>
            </div>
            <Progress value={Math.min(100, (summary.usage.branches / summary.usage.maxBranches) * 100)} className="h-2" />
            <p className="text-[11px] text-muted-foreground">Outlet operasional</p>
          </div>

          {/* Staff Usage */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-1.5 text-muted-foreground font-medium">
                <UsersRound className="size-4 text-orange-600" /> Akun Kasir
              </span>
              <span className="font-bold">
                {summary.usage.members} / {formatUsageMax(summary.usage.maxMembers)}
              </span>
            </div>
            <Progress
              value={calculateProgress(summary.usage.members, summary.usage.maxMembers)}
              className="h-2"
            />
            <p className="text-[11px] text-muted-foreground">Hak akses tim</p>
          </div>
        </CardContent>
      </Card>

      {/* Pricing Cards Grid */}
      <div className="grid gap-6 lg:grid-cols-3 items-stretch mt-4">
        {plans.map((p) => {
          const isCurrent = summary.planId === p.id && !summary.isTrial
          const isPro = p.id === "pro"
          const isBusiness = p.id === "business"
          const price = billingCycle === "yearly" ? p.priceYearly : p.priceMonthly

          return (
            <Card
              key={p.id}
              className={`p-6 flex flex-col justify-between transition-all duration-200 shadow-sm gap-0 ${
                isPro
                  ? "border-emerald-600 dark:border-emerald-500 shadow-emerald-600/10 shadow-md ring-1 ring-emerald-600"
                  : "border-border"
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-xl font-bold text-foreground">{p.name}</h3>
                  {isCurrent && (
                    <Badge className="bg-emerald-600 text-white hover:bg-emerald-600 text-[11px]">Paket Aktif</Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground min-h-[32px] mt-1.5 leading-relaxed">
                  {p.description}
                </p>
                <div className="pt-4 pb-2 min-h-[64px] flex flex-col justify-center">
                  <div>
                    <span className="text-3xl font-extrabold text-foreground">{price === 0 ? "Gratis" : rupiah(price)}</span>
                    {price > 0 && (
                      <span className="text-xs text-muted-foreground"> / bulan</span>
                    )}
                  </div>
                  {billingCycle === "yearly" && price > 0 ? (
                    <p className="text-[11px] text-emerald-600 font-semibold mt-1">Ditagih tahunan (hemat 20%)</p>
                  ) : (
                    <p className="text-[11px] text-muted-foreground/60 mt-1">
                      {price === 0 ? "Tanpa biaya berlangganan" : "Ditagih per bulan"}
                    </p>
                  )}
                </div>

                <div className="space-y-4 text-sm pt-4 mt-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">Kapasitas & Batasan:</p>
                  <ul className="space-y-2.5 text-xs">
                    <li className="flex items-center gap-2">
                      <Check className="size-4 text-emerald-600 shrink-0" />
                      <span>
                        <strong>{formatLimit(p.limits.maxMonthlyOrders)}</strong> transaksi / bulan
                      </span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="size-4 text-emerald-600 shrink-0" />
                      <span>
                        <strong>{formatLimit(p.limits.maxProducts)}</strong> katalog produk
                      </span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="size-4 text-emerald-600 shrink-0" />
                      <span>
                        <strong>{p.limits.maxBranches}</strong> cabang outlet
                      </span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="size-4 text-emerald-600 shrink-0" />
                      <span>
                        <strong>{formatLimit(p.limits.maxMembers)}</strong> akun staf kasir
                      </span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="size-4 text-emerald-600 shrink-0" />
                      <span>
                        Riwayat transaksi <strong>{formatHistoryDays(p.limits.historyDays)}</strong>
                      </span>
                    </li>
                  </ul>

                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground pt-2">Fitur Unggulan:</p>
                  <ul className="space-y-2.5 text-xs">
                    <li className="flex items-center gap-2">
                      {p.features.selfOrderQR ? (
                        <Check className="size-4 text-emerald-600 shrink-0 font-bold" />
                      ) : (
                        <X className="size-4 text-muted-foreground/50 shrink-0" />
                      )}
                      <span className={p.features.selfOrderQR ? "font-medium" : "text-muted-foreground line-through opacity-70"}>
                        Self Order QR Meja & Menu Digital
                      </span>
                    </li>
                    <li className="flex items-center gap-2">
                      {p.features.recipeBOM ? (
                        <Check className="size-4 text-emerald-600 shrink-0 font-bold" />
                      ) : (
                        <X className="size-4 text-muted-foreground/50 shrink-0" />
                      )}
                      <span className={p.features.recipeBOM ? "font-medium" : "text-muted-foreground line-through opacity-70"}>
                        Resep Bahan Baku (BOM) & HPP Otomatis
                      </span>
                    </li>
                    <li className="flex items-center gap-2">
                      {p.features.exportReports ? (
                        <Check className="size-4 text-emerald-600 shrink-0 font-bold" />
                      ) : (
                        <X className="size-4 text-muted-foreground/50 shrink-0" />
                      )}
                      <span className={p.features.exportReports ? "font-medium" : "text-muted-foreground line-through opacity-70"}>
                        Export Laporan ke Excel & PDF
                      </span>
                    </li>
                    <li className="flex items-center gap-2">
                      {p.features.whatsappRecap ? (
                        <Check className="size-4 text-emerald-600 shrink-0 font-bold" />
                      ) : (
                        <X className="size-4 text-muted-foreground/50 shrink-0" />
                      )}
                      <span className={p.features.whatsappRecap ? "font-medium" : "text-muted-foreground line-through opacity-70"}>
                        Notifikasi Rekap Shift ke WhatsApp Owner
                      </span>
                    </li>
                    <li className="flex items-center gap-2">
                      {p.features.aiAdvisor ? (
                        <Check className="size-4 text-emerald-600 shrink-0 font-bold" />
                      ) : (
                        <X className="size-4 text-muted-foreground/50 shrink-0" />
                      )}
                      <span className={p.features.aiAdvisor ? "font-medium" : "text-muted-foreground line-through opacity-70"}>
                        AI Business Advisor & Prediksi Penjualan
                      </span>
                    </li>
                    <li className="flex items-center gap-2">
                      {p.features.promotionsAndDiscounts ? (
                        <Check className="size-4 text-emerald-600 shrink-0 font-bold" />
                      ) : (
                        <X className="size-4 text-muted-foreground/50 shrink-0" />
                      )}
                      <span className={p.features.promotionsAndDiscounts ? "font-medium" : "text-muted-foreground line-through opacity-70"}>
                        Voucher Promo & Diskon Bertingkat
                      </span>
                    </li>
                  </ul>
                </div>
              </div>

              <div className="pt-6 mt-4">
                {isCurrent ? (
                  <Button variant="outline" className="w-full" disabled>
                    Sedang Digunakan
                  </Button>
                ) : isOwner ? (
                  <Button
                    className={`w-full font-bold ${
                      isPro || isBusiness
                        ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/20"
                        : "bg-muted text-foreground hover:bg-muted/80"
                    }`}
                    onClick={() => handleUpgrade(p.id)}
                    disabled={upgrading !== null}
                  >
                    {upgrading === p.id ? (
                      <>
                        <Loader2 className="mr-2 size-4 animate-spin" /> Memproses...
                      </>
                    ) : p.id === "free" ? (
                      "Pilih Starter"
                    ) : (
                      `Pilih ${p.name}`
                    )}
                  </Button>
                ) : (
                  <p className="text-xs text-center text-muted-foreground w-full">Hanya Owner yang dapat mengubah paket.</p>
                )}
              </div>
            </Card>
          )
        })}
      </div>

      {/* Midtrans QRIS Payment Modal Dialog */}
      <Dialog open={qrisModal !== null} onOpenChange={(open) => !open && setQrisModal(null)}>
        <DialogContent className="sm:max-w-md p-0 overflow-hidden border-border">
          {/* Header Banner */}
          <DialogHeader className="bg-gradient-to-r from-emerald-600 to-teal-600 p-6 text-white text-left relative space-y-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex size-8 items-center justify-center rounded-lg bg-white/20 backdrop-blur-md text-white shadow-xs">
                  <QrCode className="size-4" />
                </span>
                <div className="text-left">
                  <DialogTitle className="text-base font-bold text-white leading-none">
                    Pembayaran QRIS & Gateway
                  </DialogTitle>
                  <DialogDescription className="text-[11px] text-emerald-100 mt-1">
                    {qrisModal?.provider === "doku"
                      ? "DOKU Official Payment Gateway"
                      : qrisModal?.provider === "midtrans"
                      ? "Midtrans Official Payment Gateway"
                      : "Official Payment Gateway"}
                  </DialogDescription>
                </div>
              </div>
              <Badge className="bg-white/20 hover:bg-white/25 text-white border-0 text-[10px] font-bold uppercase tracking-wider backdrop-blur-md">
                Otomatis Aktif
              </Badge>
            </div>
          </DialogHeader>

          <div className="p-6 pt-4 space-y-5">
            {qrisModal && (
              <>
                {/* Success View */}
                {isPaidSuccess ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center space-y-3 bg-emerald-50 dark:bg-emerald-950/40 rounded-2xl border border-emerald-500/30">
                    <div className="size-16 rounded-full bg-emerald-600 text-white flex items-center justify-center shadow-lg shadow-emerald-600/30 animate-bounce">
                      <CheckCircle2 className="size-10" />
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-lg font-bold text-emerald-900 dark:text-emerald-100">Pembayaran Berhasil!</h4>
                      <p className="text-xs text-emerald-700 dark:text-emerald-300 max-w-xs mx-auto">
                        Paket <strong>{qrisModal.planName}</strong> Anda telah resmi aktif. Jendela ini akan tertutup otomatis...
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-4">
                    {/* Invoice & Price Card */}
                    <div className="w-full rounded-xl bg-muted/50 p-3.5 border border-border space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Paket:</span>
                        <span className="font-bold text-foreground">
                          {qrisModal.planName} ({qrisModal.billingCycle === "yearly" ? "1 Tahun" : "1 Bulan"})
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">No. Tagihan:</span>
                        <div className="flex items-center gap-1.5 font-mono text-[11px] font-semibold text-foreground">
                          <span>{qrisModal.invoiceNumber}</span>
                          <button
                            type="button"
                            onClick={() => {
                              void navigator.clipboard.writeText(qrisModal.invoiceNumber)
                              showSuccess("Nomor tagihan disalin!")
                            }}
                            className="p-1 hover:bg-background rounded text-muted-foreground hover:text-foreground transition-colors"
                            title="Salin No Tagihan"
                          >
                            <Copy className="size-3" />
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center justify-between border-t border-border/80 pt-2 text-sm">
                        <span className="font-semibold text-foreground">Total Pembayaran:</span>
                        <span className="text-base font-extrabold text-emerald-600 dark:text-emerald-400">
                          {rupiah(qrisModal.amount)}
                        </span>
                      </div>
                    </div>

                    {/* Official-looking QRIS Card Container */}
                    <div className="flex flex-col items-center w-full max-w-[300px] rounded-2xl bg-white p-4 shadow-md border-2 border-emerald-500/40 text-black">
                      <div className="w-full flex items-center justify-between pb-2 border-b border-gray-100 mb-2">
                        <span className="font-black text-xs tracking-wider text-red-600">QRIS</span>
                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                          ✨ Nominal Terkunci
                        </span>
                      </div>

                      <div className="relative size-60 flex items-center justify-center bg-white p-2 rounded-xl border border-gray-100">
                        {qrCodeDataUrl ? (
                          <img
                            src={qrCodeDataUrl}
                            alt="QRIS Dinamis Pembayaran"
                            className="size-full object-contain"
                          />
                        ) : (
                          <Loader2 className="size-8 animate-spin text-emerald-600" />
                        )}
                      </div>

                      <div className="w-full text-center pt-2 border-t border-gray-100 mt-2 space-y-0.5">
                        <p className="text-[12px] font-bold text-gray-900 truncate">
                          {qrisModal.qrisAccountName || "Kedai-Ku POS Indonesia"}
                        </p>
                        <p className="text-[11px] font-extrabold text-emerald-600">
                          Tagihan: {rupiah(qrisModal.amount)}
                        </p>
                        {qrisModal.qrisBankName && (
                          <p className="text-[10px] text-gray-500 truncate">{qrisModal.qrisBankName}</p>
                        )}
                      </div>
                    </div>

                    {/* Transfer instructions notice */}
                    {qrisModal.qrisInstructions && (
                      <div className="p-3 rounded-xl border border-border bg-muted/40 text-left text-xs space-y-1 w-full max-w-sm">
                        <p className="font-bold text-[11px] text-foreground">📌 Petunjuk Pembayaran:</p>
                        <p className="text-[11px] text-muted-foreground leading-relaxed">
                          Saat scan QRIS di m-Banking / e-Wallet, <strong>nominal Rp {Number(qrisModal.amount).toLocaleString("id-ID")}</strong> akan otomatis terisi dan terkunci secara langsung. Anda tinggal memasukkan PIN dan konfirmasi bayar.
                        </p>
                      </div>
                    )}

                    {/* Supported Wallets / Banks Badges */}
                    <div className="flex flex-wrap items-center justify-center gap-1.5 text-[10px] text-muted-foreground max-w-xs text-center">
                      <span className="px-2 py-0.5 rounded-md bg-muted font-semibold">BCA</span>
                      <span className="px-2 py-0.5 rounded-md bg-muted font-semibold">GoPay</span>
                      <span className="px-2 py-0.5 rounded-md bg-muted font-semibold">OVO</span>
                      <span className="px-2 py-0.5 rounded-md bg-muted font-semibold">DANA</span>
                      <span className="px-2 py-0.5 rounded-md bg-muted font-semibold">ShopeePay</span>
                      <span className="px-2 py-0.5 rounded-md bg-muted font-semibold">Mandiri</span>
                      <span className="px-2 py-0.5 rounded-md bg-muted font-semibold">BRI</span>
                    </div>

                    {/* Live Listening Pulse Indicator */}
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-xs font-semibold">
                      <span className="relative flex size-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full size-2 bg-emerald-600"></span>
                      </span>
                      <span>Menunggu scan & verifikasi pembayaran...</span>
                    </div>
                    {qrisModal.expiryTime && (
                      <p className="text-xs font-semibold text-foreground" aria-live="polite">
                        Berlaku {paymentCountdown || "Menghitung…"}
                      </p>
                    )}
                  </div>
                )}

                {/* Footer Action Buttons */}
                {!isPaidSuccess && (
                  <div className="flex flex-col gap-2 pt-2">
                    <Button
                      size="sm"
                      className="w-full text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-md shadow-emerald-600/20 h-9"
                      onClick={() => {
                        showSuccess("Konfirmasi diterima! Admin akan segera memverifikasi bukti transfer dan mengaktifkan paket Anda.")
                        setQrisModal(null)
                      }}
                    >
                      <CheckCircle2 className="size-3.5 mr-1.5" /> Saya Sudah Transfer / Selesai Bayar
                    </Button>

                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full text-xs font-semibold"
                        onClick={checkManualPaymentStatus}
                        disabled={isCheckingPayment}
                      >
                        {isCheckingPayment ? <Loader2 className="size-3.5 animate-spin mr-1.5" /> : null}
                        Cek Status
                      </Button>

                      {qrisModal.snapRedirectUrl ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full text-xs text-muted-foreground hover:text-foreground"
                          onClick={() => window.open(qrisModal.snapRedirectUrl, "_blank")}
                          title="Buka halaman pembayaran gateway untuk Virtual Account, Kartu Kredit, dll"
                        >
                          <ExternalLink className="size-3.5 mr-1" />{" "}
                          {qrisModal.provider === "doku"
                            ? "Buka DOKU Checkout"
                            : qrisModal.provider === "midtrans"
                            ? "Bayar via Midtrans"
                            : "Bayar Online"}
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full text-xs text-muted-foreground"
                          onClick={() => setQrisModal(null)}
                        >
                          Tutup
                        </Button>
                      )}
                    </div>

                  </div>
                )}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
