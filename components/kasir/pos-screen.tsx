"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  Banknote,
  Barcode,
  ChevronLeft,
  CreditCard,
  Loader2,
  Minus,
  PauseCircle,
  Plus,
  QrCode,
  ReceiptText,
  Search,
  ShoppingCart,
  Store,
  Trash2,
  WalletCards,
} from "lucide-react"
import { showError, showInfo, showSuccess, showWarning } from "@/lib/toast-handler"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { useOrganization } from "@/components/kasir/organization-provider"
import { useResource } from "@/hooks/use-resource"
import { apiFetch } from "@/lib/client"

type ProductRecord = { id: string; name: string; category_id?: string; track_stock: boolean; is_active: boolean }
type VariantRecord = { id: string; product_id: string; name: string; sku: string; barcode?: string; price_amount: string; is_active: boolean }
type BalanceRecord = { id: string; warehouse_id: string; variant_id: string; available: string }
type CustomerRecord = { id: string; code: string; name: string; phone?: string; is_active: boolean }
type CategoryRecord = { id: string; name: string; is_active: boolean }
type Product = { id: string; productId: string; name: string; category: string; price: number; stock: number; trackStock: boolean; sku: string; barcode?: string }
type CartItem = Product & { quantity: number }
type CashSession = { id: string; openingAmount: string; openedAt: string; registerName: string; registerCode: string; shiftHours?: number; branchId?: string }
type ClosedCashSession = { expectedClosingAmount: string; actualClosingAmount: string; varianceAmount: string }
type CheckoutResult = { order: { id: string; orderNumber?: string; order_number?: string; totalAmount?: string; total_amount?: string; changeAmount?: string; change_amount?: string }; receipt: { verificationToken?: string; verification_token?: string }; pointsEarned?: string }

const paymentMethods = [["Tunai", "cash", Banknote], ["QRIS", "qris", QrCode], ["Kartu", "debit", CreditCard], ["E-Wallet", "e_wallet", WalletCards]] as const
const colors = ["bg-amber-100 dark:bg-amber-950", "bg-emerald-100 dark:bg-emerald-950", "bg-blue-100 dark:bg-blue-950", "bg-violet-100 dark:bg-violet-950", "bg-rose-100 dark:bg-rose-950"]
const emojis = ["☕", "🍵", "🥤", "🍛", "🥐", "📦"]
const rupiah = (amount: number) => `Rp ${amount.toLocaleString("id-ID")}`

export function PosScreen() {
  const { branch, warehouse, selectBranch, organization } = useOrganization()
  const productResource = useResource<ProductRecord>("products", "limit=100")
  const variantResource = useResource<VariantRecord>("variants", "limit=100")
  const balanceResource = useResource<BalanceRecord>("stock-balances", "limit=100")
  const customerResource = useResource<CustomerRecord>("customers", "limit=100")
  const categoryResource = useResource<CategoryRecord>("categories", "limit=100")
  const [search, setSearch] = useState("")
  const [category, setCategory] = useState("Semua")
  const [cart, setCart] = useState<CartItem[]>([])
  const [customerId, setCustomerId] = useState<string>()
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState("Tunai")
  const [cashAmount, setCashAmount] = useState("")
  const [orderNote, setOrderNote] = useState("")
  const [discount, setDiscount] = useState("0")
  const [submitting, setSubmitting] = useState(false)
  const [receipt, setReceipt] = useState<CheckoutResult>()
  const [session, setSession] = useState<CashSession | null>(null)
  const [sessionLoading, setSessionLoading] = useState(true)
  const [sessionError, setSessionError] = useState("")
  const [openForm, setOpenForm] = useState({ branchId: branch?.id ?? "", shiftHours: "8", openingAmount: "0" })
  const branches = organization?.branches ?? []
  useEffect(() => {
    if (openForm.branchId) return
    if (branch?.id) setOpenForm((current) => ({ ...current, branchId: branch.id! }))
    else if (branches.length) setOpenForm((current) => ({ ...current, branchId: branches[0].id }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branch, organization])
  const [shiftOpen, setShiftOpen] = useState(false)
  const [shiftMode, setShiftMode] = useState<"movement" | "close">("movement")
  const [movement, setMovement] = useState<{ direction: "in" | "out"; amount: string; category: string; reason: string }>({ direction: "in", amount: "", category: "", reason: "" })
  const [tenderActuals, setTenderActuals] = useState<Record<string, string>>({})
  const [settlementPreview, setSettlementPreview] = useState<{ expectedCash: string; breakdown: Record<string, { expected: string; paid: string; refunded: string }> } | null>(null)
  const [settlementNotes, setSettlementNotes] = useState("")
  const [closedSession, setClosedSession] = useState<ClosedCashSession>()
  const [orderKey, setOrderKey] = useState(() => crypto.randomUUID())

  const loadSession = useCallback(async () => {
    setSessionLoading(true)
    setSessionError("")
    try {
      const response = await apiFetch<CashSession | null>("/api/v1/finance/cash-sessions/active")
      if (response.data) {
        setSession(response.data)
        return
      }
      setSession(null)
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Gagal memuat shift kasir"
      setSessionError(message)
      setSession(null)
      showError(message)
    } finally {
      setSessionLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadSession()
    const refresh = () => void loadSession()
    window.addEventListener("kasir-ku-context-change", refresh)
    return () => window.removeEventListener("kasir-ku-context-change", refresh)
  }, [loadSession])

  async function openShift(event: React.FormEvent) {
    event.preventDefault()
    if (!openForm.branchId) return showError("Pilih cabang tempat kasir bertugas dahulu")
    if (Number(openForm.shiftHours) < 1 || Number(openForm.shiftHours) > 24) return showError("Jam jaga shift antara 1-24 jam")
    setSubmitting(true)
    try {
      selectBranch(openForm.branchId)
      const result = await apiFetch<CashSession>("/api/v1/finance/cash-sessions", {
        method: "POST",
        body: JSON.stringify({ branchId: openForm.branchId, openingAmount: openForm.openingAmount || "0", shiftHours: Number(openForm.shiftHours) }),
      })
      if (result.queued) return showWarning("Buka shift disimpan offline, akan disinkronkan saat koneksi kembali")
      setSession(result.data)
      setOpenForm((current) => ({ ...current, openingAmount: "0" }))
      showSuccess(`Shift dibuka untuk ${result.data.registerName}`)
    } catch (caught) {
      showError(caught instanceof Error ? caught.message : "Gagal membuka shift kasir")
    } finally {
      setSubmitting(false)
    }
  }



  async function recordMovement(event: React.FormEvent) {
    event.preventDefault()
    if (!session) return
    setSubmitting(true)
    try {
      await apiFetch(`/api/v1/finance/cash-sessions/${session.id}/movements`, { method: "POST", body: JSON.stringify(movement) })
      showSuccess(movement.direction === "in" ? "Kas masuk dicatat" : "Kas keluar dicatat")
      setMovement({ direction: "in", amount: "", category: "", reason: "" })
      setShiftOpen(false)
    } catch (caught) {
      showError(caught instanceof Error ? caught.message : "Gagal mencatat mutasi kas")
    } finally {
      setSubmitting(false)
    }
  }

  async function closeShift(event: React.FormEvent) {
    event.preventDefault()
    if (!session) return
    if (cart.length) return showError("Selesaikan atau kosongkan keranjang sebelum menutup shift")
    const actuals = Object.fromEntries(Object.entries(tenderActuals).filter(([, value]) => value !== ""))
    if (actuals.cash === undefined) return showError("Kas aktual wajib diisi")
    setSubmitting(true)
    try {
      const response = await apiFetch<ClosedCashSession>(`/api/v1/finance/cash-sessions/${session.id}/close`, {
        method: "POST",
        body: JSON.stringify({ tenderActuals: actuals, notes: settlementNotes || undefined }),
      })
      setClosedSession(response.data)
      setSession(null)
      setShiftOpen(false)
      setTenderActuals({})
      setSettlementPreview(null)
      setSettlementNotes("")
      showSuccess("Shift kasir ditutup")
    } catch (caught) {
      showError(caught instanceof Error ? caught.message : "Gagal menutup shift")
    } finally {
      setSubmitting(false)
    }
  }

  async function showShift(mode: "movement" | "close") {
    setShiftMode(mode)
    setShiftOpen(true)
    if (mode === "close" && session) {
      // Fetch expected settlement so the cashier can see what to count
      try {
        const response = await apiFetch<{ expectedCash: string; breakdown: Record<string, { expected: string; paid: string; refunded: string }> }>(`/api/v1/finance/cash-sessions/${session.id}/preview`)
        const preview = response.data
        setSettlementPreview(preview)
        // Pre-fill actuals with expected amounts — cashier adjusts if physical count differs
        const prefilled: Record<string, string> = {}
        for (const [method, info] of Object.entries(preview.breakdown)) {
          prefilled[method] = info.expected
        }
        setTenderActuals(prefilled)
      } catch {
        // If preview fails, start with empty actuals (server will use expected as default)
        setSettlementPreview(null)
      }
    }
  }

  const products = useMemo(() => {
    const productById = new Map(productResource.data.map((item) => [item.id, item]))
    const categoryById = new Map(categoryResource.data.map((item) => [item.id, item.name]))
    const balanceByVariant = new Map(balanceResource.data.filter((item) => item.warehouse_id === warehouse?.id).map((item) => [item.variant_id, Number(item.available)]))
    return variantResource.data.filter((variant) => variant.is_active && productById.get(variant.product_id)?.is_active).map((variant): Product => {
      const product = productById.get(variant.product_id)!
      return {
        id: variant.id,
        productId: product.id,
        name: variant.name === "Default" ? product.name : `${product.name} - ${variant.name}`,
        category: product.category_id ? categoryById.get(product.category_id) || "Lainnya" : "Lainnya",
        price: Number(variant.price_amount),
        stock: balanceByVariant.get(variant.id) ?? 0,
        trackStock: product.track_stock,
        sku: variant.sku,
        barcode: variant.barcode,
      }
    })
  }, [productResource.data, categoryResource.data, balanceResource.data, variantResource.data, warehouse?.id])

  const categories = ["Semua", ...Array.from(new Set(products.map((item) => item.category)))]
  const filtered = products.filter((product) => (category === "Semua" || product.category === category) && `${product.name} ${product.sku} ${product.barcode || ""}`.toLowerCase().includes(search.toLowerCase()))
  const subtotal = cart.reduce((total, item) => total + item.price * item.quantity, 0)
  const discountAmount = Math.min(Number(discount) || 0, subtotal)
  const taxable = subtotal - discountAmount
  const tax = 0
  const total = taxable + tax
  const cash = Number(cashAmount.replaceAll(/\D/g, "")) || 0
  const loading = productResource.loading || variantResource.loading || balanceResource.loading

  // Every field that reaches the checkout body. Same signature = same order = reuse the key so a
  // retry replays server-side instead of creating a second order. Any edit mints a fresh key so
  // the server never sees one key carrying two different requests.
  const orderSignature = JSON.stringify([
    branch?.id, warehouse?.id, session?.id, customerId, orderNote, discountAmount, paymentMethod, cash,
    cart.map((item) => [item.id, item.quantity, item.price]),
  ])

  useEffect(() => { setOrderKey(crypto.randomUUID()) }, [orderSignature])

  function add(product: Product) {
    if (product.trackStock && product.stock <= 0) return showError("Stok produk habis")
    setCart((current) => {
      const exists = current.find((item) => item.id === product.id)
      if (exists) {
        if (product.trackStock && exists.quantity >= product.stock) { showError("Jumlah melebihi stok tersedia"); return current }
        return current.map((item) => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item)
      }
      return [...current, { ...product, quantity: 1 }]
    })
  }

  function change(id: string, changeBy: number) {
    setCart((current) => current.map((item) => {
      if (item.id !== id) return item
      const next = item.quantity + changeBy
      if (item.trackStock && next > item.stock) { showError("Jumlah melebihi stok tersedia"); return item }
      return { ...item, quantity: next }
    }).filter((item) => item.quantity > 0))
  }

  async function submitOrder(status: "paid" | "held") {
    if (!branch?.id || !warehouse?.id) return showError("Cabang atau gudang belum dipilih")
    if (!session) return showError("Buka shift kasir sebelum transaksi")
    if (!cart.length) return
    if (status === "paid" && paymentMethod === "Tunai" && cash < total) return showError("Nominal tunai belum cukup")
    setSubmitting(true)
    try {
      const selected = paymentMethods.find(([name]) => name === paymentMethod)!
      const paymentAmount = paymentMethod === "Tunai" ? cash : total
      // status is part of the body, so hold and pay on one cart must not share a key.
      const requestKey = `${orderKey}-${status}`
      const response = await apiFetch<CheckoutResult>("/api/v1/pos/checkout", {
        method: "POST",
        queueOffline: true,
        headers: { "idempotency-key": requestKey },
        body: JSON.stringify({
          branchId: branch.id,
          warehouseId: warehouse.id,
          cashSessionId: session.id,
          customerId,
          status,
          notes: orderNote || undefined,
          discountAmount: String(discountAmount),
          serviceChargeAmount: "0",
          offlineReference: requestKey,
          items: cart.map((item) => ({ variantId: item.id, quantity: String(item.quantity), unitPriceAmount: String(item.price), discountAmount: "0" })),
          payments: status === "paid" ? [{ method: selected[1], amount: String(paymentAmount) }] : [],
        }),
      })
      if (response.queued) {
        showWarning("Transaksi disimpan offline, akan disinkronkan saat koneksi kembali")
        setPaymentOpen(false); setCart([]); setOrderNote(""); setDiscount("0"); return
      }
      showSuccess(status === "held" ? "Pesanan ditahan" : "Pembayaran berhasil")
      if (status === "held") { setCart([]); setOrderNote(""); setDiscount("0") }
      else setReceipt(response.data)
      await Promise.all([balanceResource.refresh(), productResource.refresh(), variantResource.refresh()])
    } catch (caught) { showError(caught instanceof Error ? caught.message : "Transaksi gagal") }
    finally { setSubmitting(false) }
  }

  function newOrder() { setReceipt(undefined); setPaymentOpen(false); setCart([]); setCashAmount(""); setOrderNote(""); setDiscount("0"); setCustomerId(undefined) }

  const shiftDialog = session ? <Dialog open={shiftOpen} onOpenChange={setShiftOpen}><DialogContent><DialogHeader><DialogTitle>Kelola shift kasir</DialogTitle><DialogDescription>{session.registerName} • dibuka {new Date(session.openedAt).toLocaleString("id-ID")}</DialogDescription></DialogHeader><div className="grid grid-cols-2 gap-2"><Button type="button" variant={shiftMode === "movement" ? "default" : "outline"} onClick={() => setShiftMode("movement")}>Mutasi kas</Button><Button type="button" variant={shiftMode === "close" ? "destructive" : "outline"} onClick={() => setShiftMode("close")}>Tutup shift</Button></div>{shiftMode === "movement" ? <form onSubmit={recordMovement} className="space-y-4"><div className="space-y-2"><Label>Jenis</Label><Select value={movement.direction} onValueChange={(value: "in" | "out") => setMovement((current) => ({ ...current, direction: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="in">Kas masuk</SelectItem><SelectItem value="out">Kas keluar</SelectItem></SelectContent></Select></div><div className="space-y-2"><Label htmlFor="movement-amount">Nominal</Label><Input id="movement-amount" type="number" min="1" step="1" value={movement.amount} onChange={(event) => setMovement((current) => ({ ...current, amount: event.target.value }))} required /></div><div className="space-y-2"><Label htmlFor="movement-category">Kategori</Label><Input id="movement-category" value={movement.category} onChange={(event) => setMovement((current) => ({ ...current, category: event.target.value }))} placeholder="Modal tambahan / petty cash" minLength={2} required /></div><div className="space-y-2"><Label htmlFor="movement-reason">Alasan</Label><Input id="movement-reason" value={movement.reason} onChange={(event) => setMovement((current) => ({ ...current, reason: event.target.value }))} minLength={3} required /></div><DialogFooter><Button type="submit" className="bg-emerald-600 hover:bg-emerald-700" disabled={submitting}>{submitting && <Loader2 className="animate-spin" />} Simpan mutasi</Button></DialogFooter></form> : <form onSubmit={closeShift} className="space-y-4"><p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">Hitung uang fisik di laci kasir. Sistem menghitung ekspektasi dan selisih otomatis.</p>{settlementPreview && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-900 dark:bg-emerald-950"><p className="text-sm text-muted-foreground">Kas seharusnya</p><p className="text-xl font-bold text-emerald-700 dark:text-emerald-300">{rupiah(Number(settlementPreview.expectedCash))}</p></div>}<div className="grid grid-cols-2 gap-3">{paymentMethods.map(([name, method]) => { const expected = settlementPreview?.breakdown?.[method]?.expected; return <div key={method} className="space-y-2"><Label htmlFor={`actual-${method}`}>{name} aktual{expected !== undefined && <span className="ml-1 text-xs font-normal text-muted-foreground">(seharusnya {rupiah(Number(expected))})</span>}</Label><Input id={`actual-${method}`} type="number" min="0" step="1" value={tenderActuals[method] ?? ""} onChange={(event) => setTenderActuals((current) => ({ ...current, [method]: event.target.value }))} required /></div> })}</div><div className="space-y-2"><Label htmlFor="settlement-notes">Catatan</Label><Textarea id="settlement-notes" value={settlementNotes} onChange={(event) => setSettlementNotes(event.target.value)} placeholder="Opsional: jelaskan jika ada selisih" /></div>{cart.length > 0 && <p className="text-sm text-destructive">Keranjang harus kosong sebelum shift ditutup.</p>}<DialogFooter><Button type="submit" variant="destructive" disabled={submitting || cart.length > 0}>{submitting && <Loader2 className="animate-spin" />} Tutup dan rekonsiliasi</Button></DialogFooter></form>}</DialogContent></Dialog> : null

  if (sessionLoading) {
    return <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-muted/30"><Loader2 className="size-8 animate-spin text-emerald-600" /></div>
  }

  if (closedSession) {
    return <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-muted/30 p-4"><Card className="w-full max-w-md shadow-xl"><CardContent className="p-7"><div className="text-center"><span className="mx-auto flex size-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><Banknote className="size-8" /></span><h2 className="mt-5 text-2xl font-bold">Shift berhasil ditutup</h2><p className="mt-1 text-sm text-muted-foreground">Hasil rekonsiliasi kas tersimpan.</p></div><div className="my-6 space-y-3 rounded-xl bg-muted/60 p-4"><div className="flex justify-between"><span>Kas seharusnya</span><strong>{rupiah(Number(closedSession.expectedClosingAmount))}</strong></div><div className="flex justify-between"><span>Kas aktual</span><strong>{rupiah(Number(closedSession.actualClosingAmount))}</strong></div><Separator /><div className="flex justify-between"><span>Selisih</span><strong className={Number(closedSession.varianceAmount) === 0 ? "text-emerald-600" : "text-rose-600"}>{rupiah(Number(closedSession.varianceAmount))}</strong></div></div><Button className="w-full bg-emerald-600 hover:bg-emerald-700" onClick={() => { setClosedSession(undefined); void loadSession() }}>Buka shift baru</Button></CardContent></Card></div>
  }

  if (!session) {
    return <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-muted/30 p-4"><Card className="w-full max-w-lg shadow-xl"><CardContent className="p-7"><div className="text-center"><span className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700"><Store className="size-8" /></span><h2 className="mt-5 text-2xl font-bold">Buka shift kasir</h2><p className="mt-1 text-sm text-muted-foreground">Tentukan cabang tempat kamu bertugas dan lama shift sebelum mulai bertransaksi.</p></div>{sessionError && <div className="mt-5 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"><p className="font-medium">Gagal memuat shift kasir</p><p className="mt-2">{sessionError}</p></div>}<form onSubmit={openShift} className="mt-6 space-y-4"><div className="space-y-2"><Label htmlFor="shift-branch">Cabang</Label><Select value={openForm.branchId} onValueChange={(value: string) => setOpenForm((current) => ({ ...current, branchId: value }))}><SelectTrigger id="shift-branch"><SelectValue placeholder="Pilih cabang" /></SelectTrigger><SelectContent>{branches.map((cabang) => <SelectItem key={cabang.id} value={cabang.id}>{cabang.name}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label htmlFor="shift-hours">Lama jaga (jam)</Label><Input id="shift-hours" type="number" min="1" max="24" step="1" value={openForm.shiftHours} onChange={(event) => setOpenForm((current) => ({ ...current, shiftHours: event.target.value }))} /></div><div className="space-y-2"><Label htmlFor="shift-opening">Kas awal (Rp)</Label><Input id="shift-opening" type="number" min="0" step="1" value={openForm.openingAmount} onChange={(event) => setOpenForm((current) => ({ ...current, openingAmount: event.target.value }))} placeholder="0" /></div><Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700" disabled={submitting || !branches.length}>{submitting ? <><Loader2 className="size-4 animate-spin" /> Membuka shift...</> : "Buka shift"}</Button></form></CardContent></Card></div>
  }

  if (receipt) {
    const number = receipt.order.orderNumber || receipt.order.order_number || receipt.order.id
    const verification = receipt.receipt.verificationToken || receipt.receipt.verification_token
    const receiptTotal = Number(receipt.order.totalAmount || receipt.order.total_amount || total)
    const receiptChange = Number(receipt.order.changeAmount || receipt.order.change_amount || 0)
    return <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-muted/30 p-4"><Card className="w-full max-w-md shadow-xl"><CardContent className="p-7 text-center"><span className="mx-auto flex size-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><ReceiptText className="size-8" /></span><h2 className="mt-5 text-2xl font-bold">Pembayaran berhasil</h2><p className="mt-1 text-sm text-muted-foreground">{number}</p><div className="my-6 space-y-3 rounded-xl bg-muted/60 p-4 text-left"><div className="flex justify-between"><span>Total</span><strong>{rupiah(receiptTotal)}</strong></div><div className="flex justify-between"><span>Metode</span><strong>{paymentMethod}</strong></div>{paymentMethod === "Tunai" && <div className="flex justify-between"><span>Kembalian</span><strong>{rupiah(receiptChange)}</strong></div>}<Separator /><p className="break-all text-xs text-muted-foreground">Kode verifikasi: {verification}</p></div><div className="grid grid-cols-2 gap-2 print:hidden"><Button variant="outline" onClick={() => window.print()}><ReceiptText /> Cetak</Button><Button className="bg-emerald-600 hover:bg-emerald-700" onClick={newOrder}>Transaksi baru</Button></div></CardContent></Card></div>
  }

  if (paymentOpen) {
    return <div className="flex min-h-[calc(100vh-4rem)] flex-col bg-muted/30 p-4 md:p-6"><div className="mx-auto w-full max-w-5xl"><Button variant="ghost" className="mb-4" onClick={() => setPaymentOpen(false)}><ChevronLeft /> Kembali ke keranjang</Button><div className="grid gap-5 lg:grid-cols-[1fr_0.8fr]"><Card><CardContent className="p-6"><h2 className="text-xl font-bold">Pilih metode pembayaran</h2><p className="mt-1 text-sm text-muted-foreground">Transaksi akan disimpan ke database dan stok langsung berkurang.</p><div className="mt-6 grid grid-cols-2 gap-3">{paymentMethods.map(([name, , Icon]) => <Button key={name} variant={paymentMethod === name ? "default" : "outline"} className={`h-24 flex-col gap-2 ${paymentMethod === name ? "bg-emerald-600 hover:bg-emerald-700" : ""}`} onClick={() => setPaymentMethod(name)}><Icon className="size-6" />{name}</Button>)}</div>{paymentMethod === "Tunai" && <div className="mt-6 space-y-3"><Label>Uang diterima</Label><Input value={cashAmount} onChange={(event) => setCashAmount(event.target.value)} placeholder="Rp 0" className="h-14 text-xl font-semibold" /><div className="grid grid-cols-4 gap-2">{[50000, 100000, 150000, 200000].map((amount) => <Button key={amount} type="button" variant="outline" size="sm" onClick={() => setCashAmount(String(amount))}>{amount / 1000}rb</Button>)}</div></div>}</CardContent></Card><Card className="h-fit"><CardContent className="p-6"><h3 className="font-semibold">Ringkasan pembayaran</h3><div className="mt-5 space-y-3 text-sm"><div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{rupiah(subtotal)}</span></div>{discountAmount > 0 && <div className="flex justify-between text-rose-600"><span>Diskon</span><span>-{rupiah(discountAmount)}</span></div>}<div className="flex justify-between"><span className="text-muted-foreground">Pajak</span><span>{rupiah(tax)}</span></div><Separator /><div className="flex justify-between text-xl font-bold"><span>Total</span><span className="text-emerald-600">{rupiah(total)}</span></div>{paymentMethod === "Tunai" && cash >= total && <div className="flex justify-between rounded-lg bg-emerald-50 p-3 font-medium text-emerald-700"><span>Kembalian</span><span>{rupiah(cash - total)}</span></div>}</div><Button className="mt-6 h-14 w-full bg-emerald-600 text-base hover:bg-emerald-700" onClick={() => void submitOrder("paid")} disabled={submitting}>{submitting ? <Loader2 className="animate-spin" /> : <ReceiptText />} Bayar {rupiah(total)}</Button></CardContent></Card></div></div></div>
  }

  return <div className="grid min-h-[calc(100vh-4rem)] grid-cols-1 bg-muted/30 xl:grid-cols-[1fr_430px]">{shiftDialog}<section className="min-w-0 p-4 md:p-5"><div className="mb-4 flex flex-col gap-3 rounded-xl border bg-background p-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="flex items-center gap-2 font-semibold"><Store className="size-4 text-emerald-600" />{session.registerName} <Badge variant="outline">Shift aktif</Badge></p><p className="mt-1 text-xs text-muted-foreground">{branches.find((cabang) => cabang.id === session.branchId)?.name ? `${branches.find((cabang) => cabang.id === session.branchId)?.name} • ` : ""}Kas awal {rupiah(Number(session.openingAmount))} • {new Date(session.openedAt).toLocaleString("id-ID")}{session.shiftHours ? ` • Jaga ${session.shiftHours} jam` : ""}</p></div><div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => showShift("movement")}><Banknote /> Mutasi kas</Button><Button size="sm" variant="destructive" onClick={() => showShift("close")}>Tutup shift</Button></div></div><div className="mb-4 flex gap-2"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" /><Input className="h-12 bg-background pl-10" placeholder="Cari produk, SKU, atau barcode..." value={search} onChange={(event) => setSearch(event.target.value)} autoFocus /></div><Button variant="outline" size="icon" className="size-12 bg-background" onClick={() => showInfo("Masukkan barcode pada kolom pencarian")}><Barcode className="size-5" /></Button></div><ScrollArea className="mb-4 w-full whitespace-nowrap"><div className="flex gap-2 pb-2">{categories.map((item) => <Button key={item} size="sm" variant={category === item ? "default" : "outline"} className={category === item ? "bg-emerald-600 hover:bg-emerald-700" : "bg-background"} onClick={() => setCategory(item)}>{item}</Button>)}</div></ScrollArea>{loading && <div className="flex h-64 items-center justify-center"><Loader2 className="size-7 animate-spin text-emerald-600" /></div>}{!loading && !filtered.length && <div className="flex h-64 flex-col items-center justify-center text-center"><ShoppingCart className="size-10 text-muted-foreground/30" /><p className="mt-3 font-medium">Produk tidak ditemukan</p><p className="text-sm text-muted-foreground">Tambahkan produk dan stok dari menu Produk.</p></div>}<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">{filtered.map((product, index) => <button key={product.id} disabled={product.trackStock && product.stock <= 0} className="group overflow-hidden rounded-xl border bg-card text-left shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-400 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50" onClick={() => add(product)}><div className={`flex aspect-[1.5] items-center justify-center text-4xl ${colors[index % colors.length]}`}>{emojis[index % emojis.length]}</div><div className="p-3"><p className="truncate text-sm font-semibold">{product.name}</p><p className="mt-1 text-sm font-bold text-emerald-600">{rupiah(product.price)}</p><p className="mt-2 truncate text-xs text-muted-foreground">{product.sku} • Stok {product.trackStock ? product.stock : "∞"}</p></div></button>)}</div></section><aside className="flex min-h-[600px] flex-col border-l bg-background xl:h-[calc(100vh-4rem)]"><div className="border-b p-4"><h2 className="flex items-center gap-2 font-bold"><ShoppingCart className="size-5 text-emerald-600" /> Keranjang <Badge>{cart.reduce((sum, item) => sum + item.quantity, 0)}</Badge></h2><p className="mt-0.5 text-xs text-muted-foreground">{branch?.name} • {warehouse?.name}</p></div><div className="border-b p-3"><Select value={customerId} onValueChange={setCustomerId}><SelectTrigger><SelectValue placeholder="Pilih pelanggan (opsional)" /></SelectTrigger><SelectContent>{customerResource.data.filter((item) => item.is_active).map((item) => <SelectItem key={item.id} value={item.id}>{item.name} • {item.code}</SelectItem>)}</SelectContent></Select></div><ScrollArea className="min-h-0 flex-1"><div className="space-y-2 p-3">{!cart.length && <div className="py-16 text-center"><ShoppingCart className="mx-auto size-12 text-muted-foreground/30" /><p className="mt-4 font-medium">Keranjang kosong</p></div>}{cart.map((item) => <div key={item.id} className="rounded-xl border p-3"><div className="flex items-start gap-3"><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{item.name}</p><p className="text-xs text-muted-foreground">{rupiah(item.price)} • {item.sku}</p></div><Button variant="ghost" size="icon" className="size-8 text-destructive" onClick={() => setCart((current) => current.filter((entry) => entry.id !== item.id))}><Trash2 className="size-4" /></Button></div><div className="mt-3 flex items-center justify-between"><div className="flex items-center rounded-lg border"><Button variant="ghost" size="icon" className="size-8" onClick={() => change(item.id, -1)}><Minus className="size-3" /></Button><span className="w-8 text-center text-sm font-semibold">{item.quantity}</span><Button variant="ghost" size="icon" className="size-8" onClick={() => change(item.id, 1)}><Plus className="size-3" /></Button></div><p className="font-bold">{rupiah(item.price * item.quantity)}</p></div></div>)}</div></ScrollArea><div className="border-t p-4"><div className="mb-3 grid grid-cols-2 gap-2"><Textarea placeholder="Catatan pesanan" className="min-h-16 resize-none" value={orderNote} onChange={(event) => setOrderNote(event.target.value)} /><div><Label className="text-xs">Diskon order</Label><Input type="number" min="0" value={discount} onChange={(event) => setDiscount(event.target.value)} /></div></div><div className="space-y-2 text-sm"><div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{rupiah(subtotal)}</span></div>{discountAmount > 0 && <div className="flex justify-between text-rose-600"><span>Diskon</span><span>-{rupiah(discountAmount)}</span></div>}<div className="flex justify-between"><span>Pajak</span><span>{rupiah(tax)}</span></div><Separator /><div className="flex justify-between text-lg font-bold"><span>Total</span><span>{rupiah(total)}</span></div></div><div className="mt-4 grid grid-cols-[auto_1fr] gap-2"><Button variant="outline" size="icon" className="size-12" onClick={() => void submitOrder("held")} disabled={!cart.length || submitting}><PauseCircle /></Button><Button disabled={!cart.length} className="h-12 bg-emerald-600 text-base hover:bg-emerald-700" onClick={() => setPaymentOpen(true)}>Bayar {rupiah(total)}</Button></div></div></aside></div>
}
