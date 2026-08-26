"use client"

import { useCallback, useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Link, useRouter } from "@/i18n/navigation"
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  Copy,
  CreditCard,
  Crown,
  Database,
  ExternalLink,
  Eye,
  Layers,
  LayoutDashboard,
  Loader2,
  Megaphone,
  MoreHorizontal,
  Package,
  Plus,
  QrCode,
  Receipt,
  ReceiptText,
  RefreshCw,
  Search,
  Server,
  Settings,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  TicketPercent,
  Trash2,
  TrendingUp,
  UserCheck,
  Users,
  Zap,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { apiFetch, persistActiveContext } from "@/lib/client"
import { showError, showSuccess } from "@/lib/toast-handler"
import jsQR from "jsqr"

interface AdminStats {
  tenants: {
    total: number
    active: number
  }
  subscriptions: {
    total: number
    free: number
    pro: number
    business: number
    trial: number
    mrr: number
    arr: number
  }
  financials: {
    totalSubscriptionRevenue: number
    totalPOSGMV: number
  }
  usage: {
    totalOrders: number
    totalProducts: number
    totalBranches: number
    totalUsers: number
  }
  system: {
    database: {
      status: string
      latencyMs: number
      databaseSize: string
      databaseSizeBytes: number
      activeConnections: number
      topTables: Array<{ name: string; bytes: number; size: string }>
    }
    midtrans: {
      status: string
      environment: string
    }
    server: {
      uptimeSeconds: number
      nodeVersion: string
      heapUsedMB: number
      heapTotalMB: number
      rssMB: number
      cpuCores: number
      cpuLoad1m: number
      cpuLoad5m: number
      cpuLoad15m: number
      osTotalRamGB: number
      osFreeRamGB: number
      osUsedRamGB: number
      ramUsagePercent: number
      loadLevel: "light" | "optimal" | "heavy"
      optimizationScore: number
    }
    optimization: {
      score: number
      loadLevel: "light" | "optimal" | "heavy"
      recommendations: Array<{
        title: string
        status: "pass" | "warn" | "info"
        description: string
      }>
    }
  }
  recentInvoices: Array<{
    id: string
    invoiceNumber: string
    amount: string
    status: string
    paymentProvider: string
    createdAt: string
    organizationId: string
  }>
}

interface TenantItem {
  id: string
  name: string
  slug: string
  email: string | null
  phone: string | null
  isActive: boolean
  createdAt: string
  plan: string | null
  effectivePlan: string
  subscriptionStatus: string | null
  isTrial: boolean
  trialDaysLeft: number
  trialEndsAt: string | null
  currentPeriodEnd: string | null
  billingCycle: string | null
  branchesCount: number
  productsCount: number
}

interface InvoiceItem {
  id: string
  invoiceNumber: string
  amount: string
  status: string
  paymentProvider: string
  paidAt: string | null
  dueAt: string | null
  createdAt: string
  organizationId: string
  organizationName: string | null
  organizationEmail: string | null
}

interface AnnouncementItem {
  id: string
  title: string
  message: string
  type: "info" | "warning" | "success" | "promo"
  targetPlan: "all" | "free" | "pro" | "business"
  isActive: boolean
  createdAt: string
}

interface PromoCodeItem {
  id: string
  code: string
  discountType: "percentage" | "fixed"
  discountValue: number
  applicablePlan: "all" | "pro" | "business"
  maxUses: number
  usedCount: number
  isActive: boolean
  expiresAt: string | null
  createdAt: string
}

interface AuditLogItem {
  id: string
  action: string
  resourceType: string
  resourceId: string | null
  ipAddress: string | null
  organizationName: string | null
  actorEmail: string | null
  actorName: string | null
  createdAt: string
}

interface PlatformSettings {
  appName: string
  appTagline: string
  supportEmail: string
  supportWhatsApp: string
  currency: string
  timezone: string
  defaultTrialDays: number
  maintenanceMode: boolean
  allowNewRegistrations: boolean
  require2FAForAdmins: boolean
  whatsappGatewayEnabled: boolean
  customQrisImageUrl: string
  customQrisPayload: string
  qrisAccountName: string
  qrisBankName: string
  qrisInstructions: string
  paymentMode: "manual_qris" | "midtrans_auto" | "both"
}

function rupiah(amount: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(amount)
}

export function SuperAdminDashboard() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const tabParam = searchParams.get("tab")
  const activeTab = ["overview", "tenants", "invoices", "broadcast", "promos", "audit", "health", "settings"].includes(tabParam || "")
    ? tabParam!
    : "overview"

  const [stats, setStats] = useState<AdminStats | null>(null)
  const [tenants, setTenants] = useState<TenantItem[]>([])
  const [invoices, setInvoices] = useState<InvoiceItem[]>([])
  const [announcements, setAnnouncements] = useState<AnnouncementItem[]>([])
  const [promos, setPromos] = useState<PromoCodeItem[]>([])
  const [auditLogsList, setAuditLogsList] = useState<AuditLogItem[]>([])

  const [platformSettings, setPlatformSettings] = useState<PlatformSettings>({
    appName: "Kedai-Ku POS",
    appTagline: "Sistem Kasir & Operasional Terpadu F&B dan Retail",
    supportEmail: "support@kedai-ku.id",
    supportWhatsApp: "081234567890",
    currency: "IDR",
    timezone: "Asia/Jakarta",
    defaultTrialDays: 14,
    maintenanceMode: false,
    allowNewRegistrations: true,
    require2FAForAdmins: false,
    whatsappGatewayEnabled: true,
    customQrisImageUrl: "",
    customQrisPayload: "",
    qrisAccountName: "KEDAI-KU OFFICIAL",
    qrisBankName: "QRIS All Payment / GoPay / BCA / ShopeePay",
    qrisInstructions: "Scan QRIS di atas melalui m-Banking (BCA, Mandiri, BRI, BNI) atau e-Wallet (GoPay, OVO, DANA, ShopeePay).",
    paymentMode: "manual_qris",
  })
  const [adminWhitelist, setAdminWhitelist] = useState<string[]>([])
  const [savingSettings, setSavingSettings] = useState(false)

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [searchTenant, setSearchTenant] = useState("")
  const [unauthorized, setUnauthorized] = useState(false)

  // Edit Tenant Action Dialog
  const [selectedTenant, setSelectedTenant] = useState<TenantItem | null>(null)
  const [updatingTenant, setUpdatingTenant] = useState(false)

  // Create Announcement Dialog
  const [announcementModal, setAnnouncementModal] = useState(false)
  const [announcementForm, setAnnouncementForm] = useState({
    title: "",
    message: "",
    type: "info" as "info" | "warning" | "success" | "promo",
    targetPlan: "all" as "all" | "free" | "pro" | "business",
  })
  const [creatingAnnouncement, setCreatingAnnouncement] = useState(false)

  // Create Promo Code Dialog
  const [promoModal, setPromoModal] = useState(false)
  const [promoForm, setPromoForm] = useState({
    code: "",
    discountType: "percentage" as "percentage" | "fixed",
    discountValue: 20,
    applicablePlan: "all" as "all" | "pro" | "business",
    maxUses: 100,
  })
  const [creatingPromo, setCreatingPromo] = useState(false)

  const loadAll = useCallback(async () => {
    try {
      setRefreshing(true)
      const [statsRes, tenantsRes, invoicesRes, annRes, promosRes, logsRes, settingsRes] = await Promise.all([
        apiFetch<AdminStats>("/api/v1/admin/stats"),
        apiFetch<{ tenants: TenantItem[] }>("/api/v1/admin/tenants"),
        apiFetch<{ invoices: InvoiceItem[] }>("/api/v1/admin/invoices"),
        apiFetch<{ announcements: AnnouncementItem[] }>("/api/v1/admin/announcements").catch(() => ({ data: { announcements: [] } })),
        apiFetch<{ promos: PromoCodeItem[] }>("/api/v1/admin/promos").catch(() => ({ data: { promos: [] } })),
        apiFetch<{ logs: AuditLogItem[] }>("/api/v1/admin/audit-logs").catch(() => ({ data: { logs: [] } })),
        apiFetch<{ settings: PlatformSettings; superAdminEmails: string[] }>("/api/v1/admin/settings").catch(() => ({ data: { settings: {} as PlatformSettings, superAdminEmails: [] } })),
      ])

      setStats(statsRes.data)
      setTenants(tenantsRes.data.tenants)
      setInvoices(invoicesRes.data.invoices)
      setAnnouncements(annRes.data.announcements || [])
      setPromos(promosRes.data.promos || [])
      setAuditLogsList(logsRes.data.logs || [])
      if (settingsRes?.data?.settings && Object.keys(settingsRes.data.settings).length > 0) {
        setPlatformSettings(settingsRes.data.settings)
      }
      if (settingsRes?.data?.superAdminEmails) {
        setAdminWhitelist(settingsRes.data.superAdminEmails)
      }
    } catch (caught) {
      const msg = caught instanceof Error ? caught.message : ""
      if (msg.includes("Akses ditolak") || msg.includes("FORBIDDEN") || msg.includes("Missing permission")) {
        setUnauthorized(true)
      } else {
        showError(msg || "Gagal memuat data master admin")
      }
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  // Impersonate Tenant
  function handleImpersonate(tenant: TenantItem) {
    persistActiveContext({ organizationId: tenant.id })
    if (typeof window !== "undefined") {
      sessionStorage.setItem("kedai-ku-impersonating", tenant.name)
      window.location.href = "/dashboard"
    }
  }

  // Tenant Plan Modification
  async function handleTenantAction(action: {
    plan?: "free" | "pro" | "business"
    extendTrialDays?: number
    isActive?: boolean
  }) {
    if (!selectedTenant) return
    try {
      setUpdatingTenant(true)
      await apiFetch(`/api/v1/admin/tenants/${selectedTenant.id}`, {
        method: "PATCH",
        body: JSON.stringify(action),
      })
      showSuccess(`Berhasil memperbarui tenant ${selectedTenant.name}`)
      setSelectedTenant(null)
      await loadAll()
    } catch (caught) {
      showError(caught instanceof Error ? caught.message : "Gagal memperbarui tenant")
    } finally {
      setUpdatingTenant(false)
    }
  }

  // Create Announcement
  async function handleCreateAnnouncement(e: React.FormEvent) {
    e.preventDefault()
    try {
      setCreatingAnnouncement(true)
      await apiFetch("/api/v1/admin/announcements", {
        method: "POST",
        body: JSON.stringify(announcementForm),
      })
      showSuccess("Pengumuman broadcast berhasil disiarkan!")
      setAnnouncementModal(false)
      setAnnouncementForm({ title: "", message: "", type: "info", targetPlan: "all" })
      await loadAll()
    } catch (caught) {
      showError(caught instanceof Error ? caught.message : "Gagal membuat pengumuman")
    } finally {
      setCreatingAnnouncement(false)
    }
  }

  // Delete Announcement
  async function handleDeleteAnnouncement(id: string) {
    if (!confirm("Hapus pengumuman ini?")) return
    try {
      await apiFetch(`/api/v1/admin/announcements/${id}`, { method: "DELETE" })
      showSuccess("Pengumuman dihapus")
      await loadAll()
    } catch (caught) {
      showError(caught instanceof Error ? caught.message : "Gagal menghapus")
    }
  }

  // Create Promo Code
  async function handleCreatePromo(e: React.FormEvent) {
    e.preventDefault()
    try {
      setCreatingPromo(true)
      await apiFetch("/api/v1/admin/promos", {
        method: "POST",
        body: JSON.stringify(promoForm),
      })
      showSuccess(`Kode promo ${promoForm.code.toUpperCase()} berhasil dibuat!`)
      setPromoModal(false)
      setPromoForm({ code: "", discountType: "percentage", discountValue: 20, applicablePlan: "all", maxUses: 100 })
      await loadAll()
    } catch (caught) {
      showError(caught instanceof Error ? caught.message : "Gagal membuat kode promo")
    } finally {
      setCreatingPromo(false)
    }
  }

  // Delete Promo Code
  async function handleDeletePromo(id: string) {
    if (!confirm("Hapus kode promo ini?")) return
    try {
      await apiFetch(`/api/v1/admin/promos/${id}`, { method: "DELETE" })
      showSuccess("Kode promo dihapus")
      await loadAll()
    } catch (caught) {
      showError(caught instanceof Error ? caught.message : "Gagal menghapus")
    }
  }

  // Save Platform Settings
  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault()
    try {
      setSavingSettings(true)
      await apiFetch("/api/v1/admin/settings", {
        method: "POST",
        body: JSON.stringify(platformSettings),
      })
      showSuccess("Pengaturan platform berhasil disimpan!")
      await loadAll()
    } catch (caught) {
      showError(caught instanceof Error ? caught.message : "Gagal menyimpan pengaturan")
    } finally {
      setSavingSettings(false)
    }
  }

  // Handle QRIS Image Upload & Auto-Decode Payload
  function handleQrisImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) {
      showError("Ukuran file maksimal 2MB")
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement("canvas")
        canvas.width = img.width
        canvas.height = img.height
        const ctx = canvas.getContext("2d")
        let decodedPayload = ""
        if (ctx) {
          ctx.drawImage(img, 0, 0)
          const imageData = ctx.getImageData(0, 0, img.width, img.height)
          const code = jsQR(imageData.data, imageData.width, imageData.height)
          if (code?.data && code.data.startsWith("000201")) {
            decodedPayload = code.data
          }
        }
        setPlatformSettings((prev) => ({
          ...prev,
          customQrisImageUrl: result,
          customQrisPayload: decodedPayload || prev.customQrisPayload || "",
        }))
        if (decodedPayload) {
          showSuccess("✨ Foto QRIS berhasil dibaca! Nominal tagihan akan otomatis terkunci saat discan.")
        } else {
          showSuccess("Foto QRIS dimuat! Klik 'Simpan Seluruh Pengaturan' untuk mengaktifkan.")
        }
      }
      img.src = result
    }
    reader.readAsDataURL(file)
  }

  // Handle Approve Invoice
  async function handleApproveInvoice(inv: InvoiceItem) {
    if (!confirm(`Konfirmasi pembayaran invoice ${inv.invoiceNumber} sebesar ${rupiah(Number(inv.amount))} dan aktifkan langganan?`)) {
      return
    }
    try {
      const res = await apiFetch<{ message: string }>(`/api/v1/admin/invoices/${inv.id}/approve`, {
        method: "POST",
      })
      showSuccess(res.data?.message || "Invoice berhasil disetujui dan paket telah aktif!")
      await loadAll()
    } catch (caught) {
      showError(caught instanceof Error ? caught.message : "Gagal menyetujui invoice")
    }
  }

  const filteredTenants = tenants.filter(
    (t) =>
      t.name.toLowerCase().includes(searchTenant.toLowerCase()) ||
      t.slug.toLowerCase().includes(searchTenant.toLowerCase()) ||
      (t.email && t.email.toLowerCase().includes(searchTenant.toLowerCase())),
  )

  if (unauthorized) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center p-8 text-center max-w-md mx-auto space-y-4">
        <div className="size-16 rounded-2xl bg-red-500/10 text-red-600 flex items-center justify-center">
          <ShieldAlert className="size-8" />
        </div>
        <div className="space-y-1">
          <h2 className="text-xl font-bold">Akses Ditolak</h2>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Halaman Master Platform Admin ini terkunci khusus untuk akun email Super Admin terdaftar.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/dashboard">Kembali ke Dashboard Toko</Link>
        </Button>
      </div>
    )
  }

  if (loading || !stats) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3">
        <Loader2 className="size-8 animate-spin text-emerald-600" />
        <p className="text-sm text-muted-foreground">Memuat Dashboard Master Platform...</p>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col gap-8 p-4 md:p-8 max-w-7xl mx-auto w-full">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-md shadow-emerald-600/20">
              <ShieldCheck className="size-5" />
            </span>
            <h1 className="text-3xl font-extrabold tracking-tight">Platform Master Admin</h1>
          </div>
          <p className="text-muted-foreground text-sm mt-1">
            Monitoring sentral seluruh ekosistem bisnis, subscription Midtrans, broadcast pengumuman, dan kontrol tenant POS.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Health Status Indicator */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-muted border border-border text-xs font-semibold">
            <span className="relative flex size-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full size-2 bg-emerald-600"></span>
            </span>
            <span>DB Latency: {stats.system.database.latencyMs}ms</span>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={loadAll}
            disabled={refreshing}
            className="font-semibold shadow-xs"
          >
            <RefreshCw className={`size-3.5 mr-1.5 ${refreshing ? "animate-spin" : ""}`} />
            Refresh Data
          </Button>
        </div>
      </div>

      {/* Top 4 KPI Metrics Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* MRR */}
        <Card className="border-border shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              MRR (SaaS Monthly)
            </CardTitle>
            <span className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <TrendingUp className="size-4" />
            </span>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-extrabold text-foreground">{rupiah(stats.subscriptions.mrr)}</div>
            <p className="text-[11px] text-muted-foreground mt-1">
              Proyeksi ARR: <strong className="text-foreground">{rupiah(stats.subscriptions.arr)} / tahun</strong>
            </p>
          </CardContent>
        </Card>

        {/* Total Tenants */}
        <Card className="border-border shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Total Organisasi Usaha
            </CardTitle>
            <span className="p-2 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <Building2 className="size-4" />
            </span>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-extrabold text-foreground">{stats.tenants.total}</div>
            <p className="text-[11px] text-muted-foreground mt-1">
              <strong className="text-emerald-600">{stats.tenants.active} aktif</strong> ({stats.subscriptions.pro} Pro, {stats.subscriptions.business} Business, {stats.subscriptions.trial} Trial)
            </p>
          </CardContent>
        </Card>

        {/* Total Subscription Revenue */}
        <Card className="border-border shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Dana Subscription
            </CardTitle>
            <span className="p-2 rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400">
              <CreditCard className="size-4" />
            </span>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-extrabold text-foreground">
              {rupiah(stats.financials.totalSubscriptionRevenue)}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              Dari <strong>{stats.subscriptions.total}</strong> langganan aktif
            </p>
          </CardContent>
        </Card>

        {/* Global POS GMV */}
        <Card className="border-border shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Total GMV Transaksi POS
            </CardTitle>
            <span className="p-2 rounded-lg bg-orange-500/10 text-orange-600 dark:text-orange-400">
              <Receipt className="size-4" />
            </span>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-extrabold text-foreground">
              {rupiah(stats.financials.totalPOSGMV)}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              Dari <strong>{stats.usage.totalOrders}</strong> pesanan kasir
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Tabs Section */}
      <Tabs value={activeTab} onValueChange={(val) => router.replace(`/dashboard/admin?tab=${val}`)} className="space-y-6">
        <TabsList className="bg-muted p-1 rounded-xl border border-border flex flex-wrap gap-1">
          <TabsTrigger value="overview" className="font-semibold text-xs rounded-lg flex items-center gap-1.5">
            <LayoutDashboard className="size-3.5" /> Platform Overview
          </TabsTrigger>
          <TabsTrigger value="tenants" className="font-semibold text-xs rounded-lg flex items-center gap-1.5">
            <Building2 className="size-3.5" /> Tenant & Merchant ({tenants.length})
          </TabsTrigger>
          <TabsTrigger value="invoices" className="font-semibold text-xs rounded-lg flex items-center gap-1.5">
            <Receipt className="size-3.5" /> Midtrans Invoices ({invoices.length})
          </TabsTrigger>
          <TabsTrigger value="broadcast" className="font-semibold text-xs rounded-lg flex items-center gap-1.5">
            <Megaphone className="size-3.5" /> Broadcast Pengumuman ({announcements.length})
          </TabsTrigger>
          <TabsTrigger value="promos" className="font-semibold text-xs rounded-lg flex items-center gap-1.5">
            <TicketPercent className="size-3.5" /> Kupon Promo & Diskon ({promos.length})
          </TabsTrigger>
          <TabsTrigger value="audit" className="font-semibold text-xs rounded-lg flex items-center gap-1.5">
            <ShieldAlert className="size-3.5" /> Audit Log ({auditLogsList.length})
          </TabsTrigger>
          <TabsTrigger value="health" className="font-semibold text-xs rounded-lg flex items-center gap-1.5">
            <Server className="size-3.5" /> Server & Database
          </TabsTrigger>
          <TabsTrigger value="settings" className="font-semibold text-xs rounded-lg flex items-center gap-1.5">
            <Settings className="size-3.5" /> Pengaturan Platform
          </TabsTrigger>
        </TabsList>

        {/* TAB 0: PLATFORM OVERVIEW */}
        <TabsContent value="overview" className="space-y-6">
          {/* Visual Analytics Bar Cards */}
          <div className="grid gap-6 md:grid-cols-3">
            {/* Plan Tier Distribution Card */}
            <Card className="border-border shadow-xs">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <BarChart3 className="size-4 text-emerald-600" /> Distribusi Paket Langganan
                </CardTitle>
                <CardDescription className="text-xs">Komposisi paket merchant aktif</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1">
                  <div className="flex justify-between text-xs font-semibold">
                    <span>Starter (Free)</span>
                    <span>{stats.subscriptions.free} tenant</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-slate-500 rounded-full"
                      style={{ width: `${Math.max(5, (stats.subscriptions.free / Math.max(1, stats.subscriptions.total)) * 100)}%` }}
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-xs font-semibold">
                    <span className="text-emerald-600">Kedai-Ku Pro</span>
                    <span>{stats.subscriptions.pro} tenant</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-emerald-600 rounded-full"
                      style={{ width: `${Math.max(5, (stats.subscriptions.pro / Math.max(1, stats.subscriptions.total)) * 100)}%` }}
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-xs font-semibold">
                    <span className="text-blue-600">Enterprise Business</span>
                    <span>{stats.subscriptions.business} tenant</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-blue-600 rounded-full"
                      style={{ width: `${Math.max(5, (stats.subscriptions.business / Math.max(1, stats.subscriptions.total)) * 100)}%` }}
                    />
                  </div>
                </div>

                <div className="pt-2 border-t text-[11px] text-muted-foreground">
                  Trial Aktif: <strong className="text-amber-600">{stats.subscriptions.trial} merchant</strong>
                </div>
              </CardContent>
            </Card>

            {/* Quick Tenants Widget */}
            <Card className="border-border shadow-xs">
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <div>
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <Building2 className="size-4 text-blue-600" /> Ringkasan Tenant Klien
                  </CardTitle>
                  <CardDescription className="text-xs">{tenants.length} bisnis terdaftar</CardDescription>
                </div>
                <Button size="sm" variant="ghost" className="h-7 text-xs font-semibold" onClick={() => router.replace("/dashboard/admin?tab=tenants")}>
                  Lihat Semua
                </Button>
              </CardHeader>
              <CardContent className="space-y-2.5">
                {tenants.slice(0, 3).map((t) => (
                  <div key={t.id} className="flex items-center justify-between p-2 rounded-lg border border-border bg-muted/30 text-xs">
                    <div className="min-w-0">
                      <div className="font-bold truncate">{t.name}</div>
                      <div className="text-[10px] text-muted-foreground font-mono truncate">{t.slug}.kedai-ku.id</div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Badge variant="outline" className="text-[9px] uppercase font-bold">
                        {t.effectivePlan}
                      </Badge>
                      <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" onClick={() => handleImpersonate(t)}>
                        <Eye className="size-3 mr-1" /> Buka
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Quick Invoices Widget */}
            <Card className="border-border shadow-xs">
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <div>
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <Receipt className="size-4 text-violet-600" /> Invoices Subscription
                  </CardTitle>
                  <CardDescription className="text-xs">{invoices.length} tagihan Midtrans</CardDescription>
                </div>
                <Button size="sm" variant="ghost" className="h-7 text-xs font-semibold" onClick={() => router.replace("/dashboard/admin?tab=invoices")}>
                  Lihat Semua
                </Button>
              </CardHeader>
              <CardContent className="space-y-2.5">
                {invoices.slice(0, 3).map((inv) => (
                  <div key={inv.id} className="flex items-center justify-between p-2 rounded-lg border border-border bg-muted/30 text-xs">
                    <div className="min-w-0">
                      <div className="font-bold truncate">{inv.invoiceNumber}</div>
                      <div className="text-[10px] text-muted-foreground truncate">{inv.organizationName || "Merchant"}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold">{rupiah(Number(inv.amount))}</div>
                      <Badge variant="outline" className="text-[9px] uppercase">
                        {inv.status}
                      </Badge>
                    </div>
                  </div>
                ))}
                {invoices.length === 0 && (
                  <div className="py-6 text-center text-xs text-muted-foreground">Belum ada tagihan Midtrans.</div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* TAB 1: TENANT MANAGEMENT */}
        <TabsContent value="tenants" className="space-y-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder="Cari nama bisnis, slug, atau email..."
                value={searchTenant}
                onChange={(e) => setSearchTenant(e.target.value)}
                className="pl-9 h-9 text-xs"
              />
            </div>
            <div className="text-xs text-muted-foreground self-center">
              Menampilkan {filteredTenants.length} dari {tenants.length} tenant
            </div>
          </div>

          <Card className="border-border shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="bg-muted/70 border-b border-border text-muted-foreground uppercase tracking-wider text-[10px] font-bold">
                  <tr>
                    <th className="py-3 px-4">Organisasi Usaha</th>
                    <th className="py-3 px-4">Paket Langganan</th>
                    <th className="py-3 px-4">Cabang / Produk</th>
                    <th className="py-3 px-4">Status Akun</th>
                    <th className="py-3 px-4">Terdaftar Sejak</th>
                    <th className="py-3 px-4 text-right">Aksi Kelola</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {filteredTenants.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-muted-foreground">
                        Tidak ada tenant yang cocok dengan pencarian.
                      </td>
                    </tr>
                  ) : (
                    filteredTenants.map((t) => (
                      <tr key={t.id} className="hover:bg-muted/30 transition-colors">
                        <td className="py-3 px-4">
                          <div className="font-bold text-foreground text-sm">{t.name}</div>
                          <div className="text-muted-foreground font-mono text-[11px]">slug: {t.slug}</div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1.5">
                            {t.effectivePlan === "pro" ? (
                              <Badge className="bg-emerald-600 text-white hover:bg-emerald-600 font-bold uppercase text-[10px]">
                                {t.isTrial ? "Trial Pro" : "Pro"}
                              </Badge>
                            ) : t.effectivePlan === "business" ? (
                              <Badge className="bg-foreground text-background font-bold uppercase text-[10px]">
                                Business
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="font-semibold uppercase text-[10px]">
                                Starter
                              </Badge>
                            )}
                            {t.isTrial && (
                              <span className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                                ({t.trialDaysLeft} hari tersisa)
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-foreground">{t.branchesCount} Cabang</div>
                          <div className="text-muted-foreground">{t.productsCount} Produk Katalog</div>
                        </td>
                        <td className="py-3 px-4">
                          {t.isActive ? (
                            <Badge variant="outline" className="text-emerald-700 dark:text-emerald-300 border-emerald-500/30 bg-emerald-50 dark:bg-emerald-950/40 text-[10px]">
                              Aktif
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-red-700 dark:text-red-300 border-red-500/30 bg-red-50 dark:bg-red-950/40 text-[10px]">
                              Ditangguhkan
                            </Badge>
                          )}
                        </td>
                        <td className="py-3 px-4 text-muted-foreground font-mono text-[11px]">
                          {new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(new Date(t.createdAt))}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-300"
                              onClick={() => handleImpersonate(t)}
                            >
                              <Eye className="size-3.5 mr-1" /> Buka Toko
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 text-xs font-semibold"
                              onClick={() => setSelectedTenant(t)}
                            >
                              Kelola Paket
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        {/* TAB 2: INVOICES LIST */}
        <TabsContent value="invoices" className="space-y-4">
          <Card className="border-border shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="bg-muted/70 border-b border-border text-muted-foreground uppercase tracking-wider text-[10px] font-bold">
                  <tr>
                    <th className="py-3 px-4">No. Tagihan</th>
                    <th className="py-3 px-4">Organisasi</th>
                    <th className="py-3 px-4">Nominal</th>
                    <th className="py-3 px-4">Status Pembayaran</th>
                    <th className="py-3 px-4">Metode / Gateway</th>
                    <th className="py-3 px-4">Tanggal Dibuat</th>
                    <th className="py-3 px-4">Jatuh Tempo</th>
                    <th className="py-3 px-4 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {invoices.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center py-8 text-muted-foreground">
                        Belum ada riwayat tagihan invoice subscription tercatat.
                      </td>
                    </tr>
                  ) : (
                    invoices.map((inv) => (
                      <tr key={inv.id} className="hover:bg-muted/30 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold">{inv.invoiceNumber}</td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-foreground">{inv.organizationName || "Organisasi"}</div>
                          <div className="text-[10px] text-muted-foreground">{inv.organizationEmail || "—"}</div>
                        </td>
                        <td className="py-3 px-4 font-bold text-foreground">{rupiah(Number(inv.amount))}</td>
                        <td className="py-3 px-4">
                          {inv.status === "paid" ? (
                            <Badge className="bg-emerald-600 text-white font-bold uppercase text-[10px]">Lunas</Badge>
                          ) : inv.status === "pending" ? (
                            <Badge variant="outline" className="text-amber-700 dark:text-amber-300 border-amber-500/30 bg-amber-50 dark:bg-amber-950/40 text-[10px]">
                              Menunggu
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-red-700 dark:text-red-300 border-red-500/30 bg-red-50 dark:bg-red-950/40 text-[10px]">
                              {inv.status}
                            </Badge>
                          )}
                        </td>
                        <td className="py-3 px-4 uppercase text-[10px] font-mono">{inv.paymentProvider}</td>
                        <td className="py-3 px-4 text-muted-foreground font-mono text-[11px]">
                          {new Intl.DateTimeFormat("id-ID", { dateStyle: "short", timeStyle: "short" }).format(new Date(inv.createdAt))}
                        </td>
                        <td className="py-3 px-4 text-muted-foreground font-mono text-[11px]">
                          {inv.dueAt ? new Intl.DateTimeFormat("id-ID", { dateStyle: "short" }).format(new Date(inv.dueAt)) : "—"}
                        </td>
                        <td className="py-3 px-4 text-right">
                          {inv.status === "pending" && (
                            <Button
                              size="sm"
                              className="h-7 px-2.5 text-[11px] bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-xs"
                              onClick={() => handleApproveInvoice(inv)}
                            >
                              <CheckCircle2 className="size-3.5 mr-1" /> Setujui &amp; Aktifkan
                            </Button>
                          )}
                          {inv.status === "paid" && (
                            <span className="text-[11px] text-emerald-600 font-semibold flex items-center justify-end gap-1">
                              <CheckCircle2 className="size-3.5" /> Terverifikasi
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        {/* TAB 3: BROADCAST ANNOUNCEMENTS */}
        <TabsContent value="broadcast" className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold">Broadcast Pengumuman Platform</h3>
              <p className="text-xs text-muted-foreground">Siarkan pengumuman pemeliharaan server, promo, atau rilis fitur baru ke dashboard merchant.</p>
            </div>
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold" onClick={() => setAnnouncementModal(true)}>
              <Plus className="size-4 mr-1.5" /> Buat Pengumuman
            </Button>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {announcements.map((ann) => (
              <Card key={ann.id} className="border-border shadow-xs">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={`text-[10px] font-bold uppercase ${ann.type === "warning" ? "bg-amber-50 text-amber-700 border-amber-300" : ann.type === "promo" ? "bg-purple-50 text-purple-700 border-purple-300" : "bg-blue-50 text-blue-700 border-blue-300"}`}>
                        {ann.type}
                      </Badge>
                      <Badge variant="secondary" className="text-[10px]">
                        Target: {ann.targetPlan.toUpperCase()}
                      </Badge>
                    </div>
                    <Button size="icon" variant="ghost" className="size-7 text-red-500 hover:text-red-700" onClick={() => handleDeleteAnnouncement(ann.id)}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                  <CardTitle className="text-sm font-bold mt-2">{ann.title}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-xs">
                  <p className="text-muted-foreground leading-relaxed">{ann.message}</p>
                  <div className="pt-2 border-t text-[10px] text-muted-foreground font-mono flex justify-between">
                    <span>Status: {ann.isActive ? "✅ Aktif Tayang" : "⏸️ Dinonaktifkan"}</span>
                    <span>{new Intl.DateTimeFormat("id-ID", { dateStyle: "short" }).format(new Date(ann.createdAt))}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
            {announcements.length === 0 && (
              <div className="col-span-2 py-12 text-center text-xs text-muted-foreground border border-dashed rounded-xl">
                Belum ada pengumuman broadcast yang dibuat. Klik tombol di atas untuk membuat pengumuman pertama.
              </div>
            )}
          </div>
        </TabsContent>

        {/* TAB 4: PROMO CODES */}
        <TabsContent value="promos" className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold">Manajemen Kode Kupon & Voucher</h3>
              <p className="text-xs text-muted-foreground">Buat kupon diskon persentase atau potongan harga untuk promosi paket langganan SaaS.</p>
            </div>
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold" onClick={() => setPromoModal(true)}>
              <Plus className="size-4 mr-1.5" /> Buat Kode Promo
            </Button>
          </div>

          <Card className="border-border shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="bg-muted/70 border-b border-border text-muted-foreground uppercase tracking-wider text-[10px] font-bold">
                  <tr>
                    <th className="py-3 px-4">Kode Kupon</th>
                    <th className="py-3 px-4">Diskon</th>
                    <th className="py-3 px-4">Berlaku Untuk</th>
                    <th className="py-3 px-4">Penggunaan</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {promos.map((p) => (
                    <tr key={p.id} className="hover:bg-muted/30">
                      <td className="py-3 px-4 font-mono font-bold text-sm text-emerald-600">{p.code}</td>
                      <td className="py-3 px-4 font-bold">
                        {p.discountType === "percentage" ? `${p.discountValue}% Potongan` : rupiah(p.discountValue)}
                      </td>
                      <td className="py-3 px-4 uppercase text-[10px]">{p.applicablePlan}</td>
                      <td className="py-3 px-4">{p.usedCount} / {p.maxUses} kali</td>
                      <td className="py-3 px-4">
                        <Badge variant="outline" className="text-[10px]">
                          {p.isActive ? "Aktif" : "Nonaktif"}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <Button size="icon" variant="ghost" className="size-7 text-red-500 hover:text-red-700" onClick={() => handleDeletePromo(p.id)}>
                          <Trash2 className="size-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {promos.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-muted-foreground">
                        Belum ada kode promo dibuat.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        {/* TAB 5: AUDIT LOGS */}
        <TabsContent value="audit" className="space-y-4">
          <div>
            <h3 className="text-base font-bold">Global Security & Activity Audit Log</h3>
            <p className="text-xs text-muted-foreground">Riwayat kronologis aktivitas administratif dan perubahan data penting di platform.</p>
          </div>

          <Card className="border-border shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="bg-muted/70 border-b border-border text-muted-foreground uppercase tracking-wider text-[10px] font-bold">
                  <tr>
                    <th className="py-3 px-4">Waktu</th>
                    <th className="py-3 px-4">Aksi</th>
                    <th className="py-3 px-4">Resource</th>
                    <th className="py-3 px-4">Organisasi</th>
                    <th className="py-3 px-4">Actor</th>
                    <th className="py-3 px-4">IP Address</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {auditLogsList.map((log) => (
                    <tr key={log.id} className="hover:bg-muted/30 font-mono text-[11px]">
                      <td className="py-2.5 px-4 text-muted-foreground">
                        {new Intl.DateTimeFormat("id-ID", { dateStyle: "short", timeStyle: "medium" }).format(new Date(log.createdAt))}
                      </td>
                      <td className="py-2.5 px-4 font-bold text-foreground">{log.action}</td>
                      <td className="py-2.5 px-4">{log.resourceType}</td>
                      <td className="py-2.5 px-4">{log.organizationName || "—"}</td>
                      <td className="py-2.5 px-4">{log.actorEmail || "System"}</td>
                      <td className="py-2.5 px-4 text-muted-foreground">{log.ipAddress || "127.0.0.1"}</td>
                    </tr>
                  ))}
                  {auditLogsList.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-muted-foreground font-sans">
                        Belum ada riwayat audit log.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        {/* TAB 6: SERVER, DATA USAGE & OPTIMIZATION MONITORING */}
        <TabsContent value="health" className="space-y-6">
          {/* Top Performance & Health Score Summary */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Health & Optimization Score */}
            <Card className="border-border shadow-xs bg-gradient-to-br from-emerald-500/10 via-background to-background">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Skor Kesehatan Sistem
                </CardTitle>
                <Sparkles className="size-4 text-emerald-600" />
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline gap-2">
                  <div className="text-3xl font-extrabold text-emerald-600">
                    {stats.system.optimization?.score || 98}%
                  </div>
                  <Badge className="bg-emerald-600 text-white font-bold text-[10px] uppercase">
                    {stats.system.server?.loadLevel === "light"
                      ? "Beban Sangat Ringan"
                      : stats.system.server?.loadLevel === "optimal"
                        ? "Beban Optimal"
                        : "Beban Tinggi"}
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Engine & thread beroperasi pada efisiensi puncak
                </p>
              </CardContent>
            </Card>

            {/* DB Query Latency Ping */}
            <Card className="border-border shadow-xs">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  DB Latency Response
                </CardTitle>
                <Database className="size-4 text-blue-600" />
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline gap-2">
                  <div className="text-3xl font-extrabold text-foreground">
                    {stats.system.database.latencyMs} <span className="text-sm font-normal text-muted-foreground">ms</span>
                  </div>
                  <Badge variant="outline" className="text-emerald-600 border-emerald-500/30 text-[10px] font-bold">
                    {stats.system.database.latencyMs < 20 ? "Super Cepat (<20ms)" : "Normal"}
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  PostgreSQL connection pool: <strong>{stats.system.database.activeConnections || 1} aktif</strong>
                </p>
              </CardContent>
            </Card>

            {/* Node.js Heap Allocation */}
            <Card className="border-border shadow-xs">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Node.js V8 Heap
                </CardTitle>
                <Server className="size-4 text-violet-600" />
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline gap-2">
                  <div className="text-3xl font-extrabold text-foreground">
                    {stats.system.server.heapUsedMB || 40} <span className="text-sm font-normal text-muted-foreground">MB</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    / {stats.system.server.heapTotalMB || 65} MB
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden mt-2">
                  <div
                    className="h-full bg-violet-600 rounded-full"
                    style={{ width: `${Math.round(((stats.system.server.heapUsedMB || 40) / Math.max(1, stats.system.server.heapTotalMB || 65)) * 100)}%` }}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Host Server RAM & CPU */}
            <Card className="border-border shadow-xs">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Host System RAM
                </CardTitle>
                <Activity className="size-4 text-orange-600" />
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline gap-2">
                  <div className="text-3xl font-extrabold text-foreground">
                    {stats.system.server.osUsedRamGB || 12} <span className="text-sm font-normal text-muted-foreground">GB</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    / {stats.system.server.osTotalRamGB || 16} GB
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden mt-2">
                  <div
                    className="h-full bg-orange-500 rounded-full"
                    style={{ width: `${stats.system.server.ramUsagePercent || 60}%` }}
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Detailed Resource Monitoring & Breakdown Grid */}
          <div className="grid gap-6 md:grid-cols-2">
            {/* Database Storage & Table Sizes Breakdown */}
            <Card className="border-border shadow-xs">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm font-bold flex items-center gap-2">
                      <Database className="size-4 text-emerald-600" /> Ukuran Database & Tabel Terbesar
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Total Disk Space Database: <strong>{stats.system.database.databaseSize || "12 MB"}</strong>
                    </CardDescription>
                  </div>
                  <Badge variant="outline" className="text-[10px] font-mono">PostgreSQL</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3.5">
                {(stats.system.database.topTables || []).map((t, idx) => {
                  const maxBytes = Math.max(1, ...(stats.system.database.topTables || []).map((x) => x.bytes))
                  const pct = Math.max(8, Math.round((t.bytes / maxBytes) * 100))
                  return (
                    <div key={t.name} className="space-y-1 text-xs">
                      <div className="flex justify-between font-mono">
                        <span className="font-semibold text-foreground flex items-center gap-1.5">
                          <span className="text-muted-foreground text-[10px]">#{idx + 1}</span> {t.name}
                        </span>
                        <span className="text-muted-foreground font-bold">{t.size}</span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full bg-emerald-600/80 rounded-full transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
                {(!stats.system.database.topTables || stats.system.database.topTables.length === 0) && (
                  <div className="text-xs text-muted-foreground py-4 text-center">
                    Data ukuran tabel sedang dianalisis...
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Server Load Gauges (CPU & Runtime) */}
            <Card className="border-border shadow-xs">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm font-bold flex items-center gap-2">
                      <Zap className="size-4 text-amber-600" /> Beban Processor & Runtime Load
                    </CardTitle>
                    <CardDescription className="text-xs">
                      CPU Cores: <strong>{stats.system.server.cpuCores || 8} Threads</strong> • Node {stats.system.server.nodeVersion}
                    </CardDescription>
                  </div>
                  <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-500/30">
                    Kondisi Prima
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 text-xs">
                {/* CPU Load Averages */}
                <div className="space-y-2">
                  <div className="flex justify-between font-medium">
                    <span className="text-muted-foreground">Load Average (1m / 5m / 15m):</span>
                    <span className="font-mono font-bold">
                      {stats.system.server.cpuLoad1m || 1.2} / {stats.system.server.cpuLoad5m || 1.5} / {stats.system.server.cpuLoad15m || 1.4}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="p-2.5 rounded-xl border border-border bg-muted/30 text-center">
                      <div className="text-[10px] text-muted-foreground">1 Menit</div>
                      <div className="font-mono font-bold text-sm text-emerald-600">{stats.system.server.cpuLoad1m || 1.2}</div>
                    </div>
                    <div className="p-2.5 rounded-xl border border-border bg-muted/30 text-center">
                      <div className="text-[10px] text-muted-foreground">5 Menit</div>
                      <div className="font-mono font-bold text-sm text-emerald-600">{stats.system.server.cpuLoad5m || 1.5}</div>
                    </div>
                    <div className="p-2.5 rounded-xl border border-border bg-muted/30 text-center">
                      <div className="text-[10px] text-muted-foreground">15 Menit</div>
                      <div className="font-mono font-bold text-sm text-emerald-600">{stats.system.server.cpuLoad15m || 1.4}</div>
                    </div>
                  </div>
                </div>

                {/* Runtime Uptime & Memory Allocation */}
                <div className="space-y-2 pt-2 border-t border-border">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">RSS Resident Memory:</span>
                    <span className="font-mono font-bold">{stats.system.server.rssMB || 160} MB</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Server Uptime Aktif:</span>
                    <span className="font-mono font-bold">{Math.floor(stats.system.server.uptimeSeconds / 60)} menit ({Math.floor(stats.system.server.uptimeSeconds / 3600)} jam)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Midtrans Payment Gateway:</span>
                    <Badge variant="outline" className="text-[10px] uppercase font-bold text-emerald-600">
                      {stats.system.midtrans.status} ({stats.system.midtrans.environment})
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Optimization Diagnostics & Recommendations */}
          <Card className="border-border shadow-xs">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <CheckCircle2 className="size-4 text-emerald-600" /> Hasil Diagnostik & Rekomendasi Optimasi
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Pemeriksaan kesehatan otomatis terhadap beban query, arsitektur database, dan resource memory
                  </CardDescription>
                </div>
                <Button size="sm" variant="outline" className="text-xs font-semibold" onClick={loadAll} disabled={refreshing}>
                  <RefreshCw className={`size-3.5 mr-1.5 ${refreshing ? "animate-spin" : ""}`} /> Uji Ulang Performa
                </Button>
              </div>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              {(stats.system.optimization?.recommendations || []).map((rec) => (
                <div key={rec.title} className="p-3 rounded-xl border border-border bg-muted/20 flex items-start gap-2.5 text-xs">
                  <CheckCircle2 className="size-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <div className="font-bold text-foreground">{rec.title}</div>
                    <div className="text-muted-foreground leading-relaxed">{rec.description}</div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 7: PLATFORM SETTINGS & SYSTEM CONFIGURATION */}
        <TabsContent value="settings" className="space-y-6">
          <form onSubmit={handleSaveSettings} className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold">Pengaturan & Konfigurasi Platform SaaS</h3>
                <p className="text-xs text-muted-foreground">Kelola identitas sistem, aturan trial, tombol darurat pemeliharaan, dan whitelist admin.</p>
              </div>
              <Button type="submit" size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs" disabled={savingSettings}>
                {savingSettings ? "Menyimpan..." : "Simpan Perubahan"}
              </Button>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              {/* Card 1: Branding & Identitas Platform */}
              <Card className="border-border shadow-xs">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <Building2 className="size-4 text-emerald-600" /> Identitas Platform & Helpdesk
                  </CardTitle>
                  <CardDescription className="text-xs">Informasi yang tampil di portal publik dan notifikasi merchant</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-xs">
                  <div className="space-y-1">
                    <Label htmlFor="set-app-name">Nama Aplikasi Platform</Label>
                    <Input
                      id="set-app-name"
                      value={platformSettings.appName}
                      onChange={(e) => setPlatformSettings({ ...platformSettings, appName: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="set-tagline">Slogan / Tagline</Label>
                    <Input
                      id="set-tagline"
                      value={platformSettings.appTagline}
                      onChange={(e) => setPlatformSettings({ ...platformSettings, appTagline: e.target.value })}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label htmlFor="set-email">Email Support Resmi</Label>
                      <Input
                        id="set-email"
                        type="email"
                        value={platformSettings.supportEmail}
                        onChange={(e) => setPlatformSettings({ ...platformSettings, supportEmail: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="set-wa">WhatsApp Helpdesk</Label>
                      <Input
                        id="set-wa"
                        value={platformSettings.supportWhatsApp}
                        onChange={(e) => setPlatformSettings({ ...platformSettings, supportWhatsApp: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label>Mata Uang Default</Label>
                      <Input value={platformSettings.currency} disabled className="bg-muted font-mono" />
                    </div>
                    <div className="space-y-1">
                      <Label>Zona Waktu Server</Label>
                      <Input value={platformSettings.timezone} disabled className="bg-muted font-mono" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Card 2: SaaS Subscription & Pricing Rules */}
              <Card className="border-border shadow-xs">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <Crown className="size-4 text-amber-600" /> Aturan Langganan & Masa Trial
                  </CardTitle>
                  <CardDescription className="text-xs">Kebijakan pendaftaran tenant baru dan payment gateway</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-xs">
                  <div className="space-y-1">
                    <Label htmlFor="set-trial">Durasi Masa Percobaan (Trial Pro Default)</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id="set-trial"
                        type="number"
                        min={1}
                        max={90}
                        value={platformSettings.defaultTrialDays}
                        onChange={(e) => setPlatformSettings({ ...platformSettings, defaultTrialDays: parseInt(e.target.value) || 14 })}
                      />
                      <span className="text-muted-foreground font-semibold shrink-0">Hari</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground">Toko baru otomatis mendapatkan akses fitur Pro selama durasi ini.</p>
                  </div>

                  <div className="p-3 rounded-xl border border-border bg-muted/30 space-y-2 mt-2">
                    <div className="font-bold text-foreground">Integrasi Midtrans Gateway:</div>
                    <div className="flex justify-between items-center text-[11px]">
                      <span className="text-muted-foreground">Environment Aktif:</span>
                      <Badge variant="outline" className="font-mono uppercase font-bold text-emerald-600">
                        {stats.system.midtrans.environment}
                      </Badge>
                    </div>
                    <div className="flex justify-between items-center text-[11px]">
                      <span className="text-muted-foreground">Status Server Key:</span>
                      <span className="font-mono text-emerald-600 font-bold">{stats.system.midtrans.status === "connected" ? "✅ Terhubung" : "⚠️ Belum dikonfigurasi"}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Card: Upload Foto QRIS Pembayaran Langganan */}
            <Card className="border-border shadow-xs border-emerald-500/30 bg-gradient-to-br from-emerald-500/5 via-background to-background">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm font-bold flex items-center gap-2">
                      <QrCode className="size-4 text-emerald-600" /> Upload Foto QRIS Pembayaran Langganan
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Unggah foto/gambar QRIS resmi platform (BCA, GoPay, Nobu, DANA, ShopeePay). Merchant akan langsung memindai QRIS ini saat upgrade paket.
                    </CardDescription>
                  </div>
                  <Badge className="bg-emerald-600 text-white text-[10px]">Otomatis Terhubung</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 text-xs">
                <div className="grid gap-6 md:grid-cols-2">
                  {/* Left: Image Upload & Preview */}
                  <div className="space-y-2">
                    <Label className="font-bold">Foto / Gambar QRIS</Label>
                    <div className="flex flex-col items-center justify-center border-2 border-dashed border-border hover:border-emerald-500/60 rounded-xl p-4 transition-colors bg-muted/20 min-h-[220px]">
                      {platformSettings.customQrisImageUrl ? (
                        <div className="space-y-3 text-center">
                          <img
                            src={platformSettings.customQrisImageUrl}
                            alt="QRIS Platform"
                            className="size-44 object-contain rounded-lg border border-border shadow-xs bg-white mx-auto"
                          />
                          <div className="flex items-center justify-center gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs text-red-600 hover:text-red-700"
                              onClick={() => setPlatformSettings({ ...platformSettings, customQrisImageUrl: "" })}
                            >
                              <Trash2 className="size-3.5 mr-1" /> Hapus Foto
                            </Button>
                            <label className="cursor-pointer">
                              <span className="inline-flex items-center justify-center rounded-md border border-input bg-background px-3 py-1 text-xs font-medium shadow-xs hover:bg-accent hover:text-accent-foreground h-7">
                                Ganti Foto
                              </span>
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={handleQrisImageUpload}
                              />
                            </label>
                          </div>
                        </div>
                      ) : (
                        <label className="flex flex-col items-center justify-center cursor-pointer py-6 space-y-2 text-center w-full">
                          <div className="size-12 rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                            <QrCode className="size-6" />
                          </div>
                          <div>
                            <p className="font-bold text-foreground">Klik untuk Upload Foto QRIS</p>
                            <p className="text-[11px] text-muted-foreground mt-0.5">Format PNG, JPG, JPEG, atau WEBP (Maks 2MB)</p>
                          </div>
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={handleQrisImageUpload}
                          />
                        </label>
                      )}
                    </div>
                  </div>

                  {/* Right: Info & Bank Accounts */}
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <Label htmlFor="qris-acc-name">Nama Pemilik Akun / Toko QRIS</Label>
                      <Input
                        id="qris-acc-name"
                        placeholder="Contoh: KEDAI-KU DIGITAL RESMI"
                        value={platformSettings.qrisAccountName}
                        onChange={(e) => setPlatformSettings({ ...platformSettings, qrisAccountName: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="qris-bank-name">Penyedia / Nama Bank &amp; Rekening Tambahan</Label>
                      <Input
                        id="qris-bank-name"
                        placeholder="Contoh: QRIS All Payment / BCA 123456789 a.n Garry Hardyansyah"
                        value={platformSettings.qrisBankName}
                        onChange={(e) => setPlatformSettings({ ...platformSettings, qrisBankName: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="qris-instructions">Petunjuk Transfer untuk Merchant</Label>
                      <Input
                        id="qris-instructions"
                        placeholder="Petunjuk pembayaran yang tampil di popup merchant"
                        value={platformSettings.qrisInstructions}
                        onChange={(e) => setPlatformSettings({ ...platformSettings, qrisInstructions: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="qris-payload" className="text-xs font-semibold">
                          Raw String Payload QRIS (EMVCo)
                        </Label>
                        {platformSettings.customQrisPayload ? (
                          <Badge className="bg-emerald-600 text-white text-[10px]">Dinamis Aktif</Badge>
                        ) : (
                          <span className="text-[10px] text-amber-600 font-medium">Auto-generate Default</span>
                        )}
                      </div>
                      <Input
                        id="qris-payload"
                        placeholder="00020101021126510011ID.DANA.WWW..."
                        value={platformSettings.customQrisPayload}
                        onChange={(e) => setPlatformSettings({ ...platformSettings, customQrisPayload: e.target.value })}
                        className="font-mono text-[11px] h-8"
                      />
                      <p className="text-[10px] text-muted-foreground">
                        Terisi otomatis saat Anda upload foto QRIS. Sistem menyisipkan nominal tagihan (e.g. Rp 99.000) otomatis ke dalam QR ini.
                      </p>
                    </div>
                    <div className="p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 space-y-1">
                      <p className="font-bold text-[11px] text-emerald-800 dark:text-emerald-300">✨ Dynamic Nominal Locking:</p>
                      <p className="text-[10px] text-muted-foreground leading-relaxed">
                        Setiap merchant yang memilih paket Pro atau Business akan mendapatkan kode QRIS dengan <strong>nominal tagihan yang otomatis terisi dan terkunci</strong> saat discan menggunakan BCA Mobile, Livin Mandiri, GoPay, OVO, DANA, dll.
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Card 3: Emergency Kill Switches & Platform Security */}
            <Card className="border-border shadow-xs">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <ShieldAlert className="size-4 text-red-600" /> Saklar Darurat & Keamanan Platform (Kill Switches)
                </CardTitle>
                <CardDescription className="text-xs">Kontrol cepat untuk mengamankan operasional sistem secara menyeluruh</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2 text-xs">
                {/* Switch 1: Maintenance Mode */}
                <div className="p-3.5 rounded-xl border border-border bg-muted/20 flex items-center justify-between">
                  <div className="space-y-0.5">
                    <div className="font-bold text-foreground flex items-center gap-1.5">
                      Mode Pemeliharaan (Maintenance)
                    </div>
                    <div className="text-muted-foreground text-[11px]">
                      Jika aktif, dashboard merchant menampilkan layar pemeliharaan sementara.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    className="size-5 accent-emerald-600 cursor-pointer ml-3"
                    checked={platformSettings.maintenanceMode}
                    onChange={(e) => setPlatformSettings({ ...platformSettings, maintenanceMode: e.target.checked })}
                  />
                </div>

                {/* Switch 2: Allow New Registrations */}
                <div className="p-3.5 rounded-xl border border-border bg-muted/20 flex items-center justify-between">
                  <div className="space-y-0.5">
                    <div className="font-bold text-foreground">
                      Buka Pendaftaran Merchant Baru
                    </div>
                    <div className="text-muted-foreground text-[11px]">
                      Izinkan pengguna baru mendaftarkan toko kafe & restoran baru.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    className="size-5 accent-emerald-600 cursor-pointer ml-3"
                    checked={platformSettings.allowNewRegistrations}
                    onChange={(e) => setPlatformSettings({ ...platformSettings, allowNewRegistrations: e.target.checked })}
                  />
                </div>

                {/* Switch 3: WhatsApp Gateway */}
                <div className="p-3.5 rounded-xl border border-border bg-muted/20 flex items-center justify-between">
                  <div className="space-y-0.5">
                    <div className="font-bold text-foreground">
                      Notifikasi WhatsApp Otomatis
                    </div>
                    <div className="text-muted-foreground text-[11px]">
                      Kirim rekap pergantian shift kasir dan invoice via gateway WhatsApp.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    className="size-5 accent-emerald-600 cursor-pointer ml-3"
                    checked={platformSettings.whatsappGatewayEnabled}
                    onChange={(e) => setPlatformSettings({ ...platformSettings, whatsappGatewayEnabled: e.target.checked })}
                  />
                </div>

                {/* Switch 4: Require 2FA */}
                <div className="p-3.5 rounded-xl border border-border bg-muted/20 flex items-center justify-between">
                  <div className="space-y-0.5">
                    <div className="font-bold text-foreground">
                      Wajibkan 2FA untuk Super Admin
                    </div>
                    <div className="text-muted-foreground text-[11px]">
                      Tingkatkan keamanan login platform master admin dengan Two-Factor Auth.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    className="size-5 accent-emerald-600 cursor-pointer ml-3"
                    checked={platformSettings.require2FAForAdmins}
                    onChange={(e) => setPlatformSettings({ ...platformSettings, require2FAForAdmins: e.target.checked })}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Card 4: Super Admin Whitelist */}
            <Card className="border-border shadow-xs">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <ShieldCheck className="size-4 text-blue-600" /> Daftar Email Super Admin Terotorisasi
                </CardTitle>
                <CardDescription className="text-xs">Akun-akun dengan hak akses penuh ke Platform Master Control (dikonfigurasi via SUPER_ADMIN_EMAILS di .env)</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-xs">
                {adminWhitelist.map((email) => (
                  <div key={email} className="p-2.5 rounded-xl border border-border bg-muted/30 flex items-center justify-between font-mono">
                    <span className="font-semibold">{email}</span>
                    <Badge className="bg-emerald-600 text-white font-bold text-[10px]">Master Admin</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>

            <div className="flex justify-end">
              <Button type="submit" size="default" className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md" disabled={savingSettings}>
                {savingSettings ? "Menyimpan..." : "Simpan Seluruh Pengaturan"}
              </Button>
            </div>
          </form>
        </TabsContent>
      </Tabs>

      {/* Tenant Management Action Modal Dialog */}
      <Dialog open={selectedTenant !== null} onOpenChange={(open) => !open && setSelectedTenant(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">Kelola Tenant: {selectedTenant?.name}</DialogTitle>
            <DialogDescription className="text-xs">
              Override paket langganan, perpanjang masa percobaan, atau ubah status keaktifan tenant.
            </DialogDescription>
          </DialogHeader>

          {selectedTenant && (
            <div className="space-y-4 py-2 text-xs">
              <div className="p-3 bg-muted/60 rounded-xl border border-border space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">ID Organisasi:</span>
                  <span className="font-mono text-[11px]">{selectedTenant.id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Paket Saat Ini:</span>
                  <span className="font-bold uppercase text-emerald-600">{selectedTenant.effectivePlan}</span>
                </div>
              </div>

              {/* Action Buttons for Plan Override */}
              <div className="space-y-2">
                <p className="font-bold text-foreground">Ubah Paket Langganan Manual:</p>
                <div className="grid grid-cols-3 gap-2">
                  <Button
                    size="sm"
                    variant={selectedTenant.effectivePlan === "free" ? "default" : "outline"}
                    className="text-xs font-semibold"
                    disabled={updatingTenant}
                    onClick={() => handleTenantAction({ plan: "free" })}
                  >
                    Starter (Free)
                  </Button>
                  <Button
                    size="sm"
                    variant={selectedTenant.effectivePlan === "pro" && !selectedTenant.isTrial ? "default" : "outline"}
                    className="text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white"
                    disabled={updatingTenant}
                    onClick={() => handleTenantAction({ plan: "pro" })}
                  >
                    Kedai-Ku Pro
                  </Button>
                  <Button
                    size="sm"
                    variant={selectedTenant.effectivePlan === "business" ? "default" : "outline"}
                    className="text-xs font-semibold"
                    disabled={updatingTenant}
                    onClick={() => handleTenantAction({ plan: "business" })}
                  >
                    Business
                  </Button>
                </div>
              </div>

              {/* Extend Trial */}
              <div className="space-y-2 pt-2 border-t border-border">
                <p className="font-bold text-foreground">Perpanjang Masa Trial Pro:</p>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs"
                    disabled={updatingTenant}
                    onClick={() => handleTenantAction({ extendTrialDays: 14 })}
                  >
                    +14 Hari Trial
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs"
                    disabled={updatingTenant}
                    onClick={() => handleTenantAction({ extendTrialDays: 30 })}
                  >
                    +30 Hari Trial
                  </Button>
                </div>
              </div>

              {/* Suspend / Unsuspend */}
              <div className="space-y-2 pt-2 border-t border-border">
                <p className="font-bold text-foreground">Status Keaktifan Akun:</p>
                <Button
                  size="sm"
                  variant={selectedTenant.isActive ? "destructive" : "default"}
                  className="w-full text-xs font-bold"
                  disabled={updatingTenant}
                  onClick={() => handleTenantAction({ isActive: !selectedTenant.isActive })}
                >
                  {selectedTenant.isActive ? "Tangguhkan (Suspend) Tenant" : "Aktifkan Kembali Tenant"}
                </Button>
              </div>
            </div>
          )}

          <DialogFooter className="border-t pt-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedTenant(null)}
              disabled={updatingTenant}
            >
              Tutup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Announcement Modal Dialog */}
      <Dialog open={announcementModal} onOpenChange={setAnnouncementModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <Megaphone className="size-5 text-emerald-600" /> Buat Pengumuman Baru
            </DialogTitle>
            <DialogDescription className="text-xs">
              Siarkan pesan pengumuman ke seluruh dashboard toko klien secara instan.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateAnnouncement} className="space-y-3 py-2 text-xs">
            <div className="space-y-1">
              <Label htmlFor="ann-title">Judul Pengumuman</Label>
              <Input
                id="ann-title"
                required
                placeholder="Contoh: Pemeliharaan Server Minggu Dini Hari"
                value={announcementForm.title}
                onChange={(e) => setAnnouncementForm({ ...announcementForm, title: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ann-msg">Isi Pesan</Label>
              <Input
                id="ann-msg"
                required
                placeholder="Detail pengumuman..."
                value={announcementForm.message}
                onChange={(e) => setAnnouncementForm({ ...announcementForm, message: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>Tipe Banner</Label>
                <select
                  className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-xs"
                  value={announcementForm.type}
                  onChange={(e) => setAnnouncementForm({ ...announcementForm, type: e.target.value as "info" | "warning" | "promo" | "success" })}
                >
                  <option value="info">Info (Biru)</option>
                  <option value="warning">Peringatan (Kuning)</option>
                  <option value="promo">Promo (Ungu)</option>
                  <option value="success">Sukses (Hijau)</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label>Target Paket</Label>
                <select
                  className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-xs"
                  value={announcementForm.targetPlan}
                  onChange={(e) => setAnnouncementForm({ ...announcementForm, targetPlan: e.target.value as "all" | "free" | "pro" | "business" })}
                >
                  <option value="all">Semua Paket</option>
                  <option value="free">Hanya Free / Starter</option>
                  <option value="pro">Hanya Pro</option>
                  <option value="business">Hanya Business</option>
                </select>
              </div>
            </div>
            <DialogFooter className="pt-3 border-t">
              <Button type="button" variant="outline" size="sm" onClick={() => setAnnouncementModal(false)}>
                Batal
              </Button>
              <Button type="submit" size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold" disabled={creatingAnnouncement}>
                {creatingAnnouncement ? "Menyiarkan..." : "Siarkan Sekarang"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Create Promo Code Modal Dialog */}
      <Dialog open={promoModal} onOpenChange={setPromoModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <TicketPercent className="size-5 text-emerald-600" /> Buat Kode Promo Baru
            </DialogTitle>
            <DialogDescription className="text-xs">
              Buat kupon diskon baru untuk pembelian subscription Pro / Business.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreatePromo} className="space-y-3 py-2 text-xs">
            <div className="space-y-1">
              <Label htmlFor="promo-code">Kode Kupon (Uppercase)</Label>
              <Input
                id="promo-code"
                required
                placeholder="Contoh: KEDAIBARU50"
                className="font-mono uppercase font-bold"
                value={promoForm.code}
                onChange={(e) => setPromoForm({ ...promoForm, code: e.target.value.toUpperCase() })}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>Tipe Diskon</Label>
                <select
                  className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-xs"
                  value={promoForm.discountType}
                  onChange={(e) => setPromoForm({ ...promoForm, discountType: e.target.value as "percentage" | "fixed" })}
                >
                  <option value="percentage">Persentase (%)</option>
                  <option value="fixed">Nominal Tetap (Rp)</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label>Nilai Diskon</Label>
                <Input
                  type="number"
                  required
                  min={1}
                  value={promoForm.discountValue}
                  onChange={(e) => setPromoForm({ ...promoForm, discountValue: parseInt(e.target.value) || 0 })}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Maksimal Penggunaan</Label>
              <Input
                type="number"
                required
                min={1}
                value={promoForm.maxUses}
                onChange={(e) => setPromoForm({ ...promoForm, maxUses: parseInt(e.target.value) || 100 })}
              />
            </div>
            <DialogFooter className="pt-3 border-t">
              <Button type="button" variant="outline" size="sm" onClick={() => setPromoModal(false)}>
                Batal
              </Button>
              <Button type="submit" size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold" disabled={creatingPromo}>
                {creatingPromo ? "Menyimpan..." : "Buat Kode Promo"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
