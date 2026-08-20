"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  Banknote,
  Barcode,
  ChevronLeft,
  Clock,
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
} from "lucide-react"
import { showError, showInfo, showSuccess, showWarning } from "@/lib/toast-handler"
import { playPosChimeSound } from "@/lib/services/sound-alert"
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
type TableRecord = { id: string; name: string; capacity: number; is_active: boolean }
type Product = { id: string; productId: string; name: string; category: string; price: number; stock: number; trackStock: boolean; sku: string; barcode?: string }
type CartItem = Product & { quantity: number }
type CashSession = { id: string; openingAmount: string; openedAt: string; registerName: string; registerCode: string; shiftHours?: number; branchId?: string }
type ClosedCashSession = { expectedClosingAmount: string; actualClosingAmount: string; varianceAmount: string }
type CheckoutResult = { order: { id: string; orderNumber?: string; order_number?: string; totalAmount?: string; total_amount?: string; changeAmount?: string; change_amount?: string }; receipt: { verificationToken?: string; verification_token?: string }; pointsEarned?: string }
type SplitPaymentItem = { id: string; method: "cash" | "qris" | "debit"; amount: number; cashTendered?: number; label: string }
type HeldOrder = {
  id: string
  createdAt: string
  cartData: {
    items: Array<{ variantId: string; quantity: number; unitPrice: string; notes?: string }>
    customerId?: string
    orderNotes?: string
    discountAmount?: string
  }
}

const paymentMethods = [["Tunai", "cash", Banknote], ["QRIS", "qris", QrCode], ["Kartu", "debit", CreditCard], ["Split Bill", "split_bill", ReceiptText]] as const
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
  const tableResource = useResource<TableRecord>("dining-tables", "limit=100")

  const [search, setSearch] = useState("")
  const [category, setCategory] = useState("Semua")
  const [cart, setCart] = useState<CartItem[]>([])
  const [customerId, setCustomerId] = useState<string>()
  const [selectedTableId, setSelectedTableId] = useState<string>("takeaway")

  // Held Orders State
  const [heldOpen, setHeldOpen] = useState(false)
  const [heldList, setHeldList] = useState<HeldOrder[]>([])
  const [heldLoading, setHeldLoading] = useState(false)
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

  // Split Bill State
  const [splitMode, setSplitMode] = useState<"equal" | "custom">("equal")
  const [splitCount, setSplitCount] = useState<number>(2)
  const [splitPayments, setSplitPayments] = useState<SplitPaymentItem[]>([])

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

  const loadHeldOrders = useCallback(async () => {
    if (!session || !branch?.id) return
    setHeldLoading(true)
    try {
      const res = await apiFetch<HeldOrder[]>("/api/v1/pos/hold")
      setHeldList(res.data || [])
    } catch {
      // Ignore
    } finally {
      setHeldLoading(false)
    }
  }, [session, branch?.id])

  useEffect(() => {
    if (session && branch?.id) { void loadHeldOrders() }
  }, [session, branch?.id, loadHeldOrders])

  async function resumeHeldOrder(held: HeldOrder) {
    try {
      setSubmitting(true)
      await apiFetch(`/api/v1/pos/hold/${held.id}/resume`, { method: "POST" })
      const restoredItems: CartItem[] = []
      for (const hItem of held.cartData.items) {
        const prod = products.find((p) => p.id === hItem.variantId)
        if (prod) { restoredItems.push({ ...prod, quantity: hItem.quantity }) }
      }
      setCart(restoredItems)
      if (held.cartData.orderNotes) setOrderNote(held.cartData.orderNotes)
      if (held.cartData.discountAmount) setDiscount(held.cartData.discountAmount)
      if (held.cartData.customerId) setCustomerId(held.cartData.customerId)
      setHeldOpen(false)
      showSuccess("Pesanan berhasil dimuat ke keranjang")
      await loadHeldOrders()
    } catch (e) {
      showError(e instanceof Error ? e.message : "Gagal memuat pesanan ditahan")
    } finally { setSubmitting(false) }
  }

  async function discardHeld(heldId: string) {
    try {
      await apiFetch(`/api/v1/pos/hold/${heldId}`, { method: "DELETE" })
      showSuccess("Pesanan ditahan dihapus")
      await loadHeldOrders()
    } catch (e) {
      showError(e instanceof Error ? e.message : "Gagal menghapus pesanan")
    }
  }

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
      try {
        const response = await apiFetch<{ expectedCash: string; breakdown: Record<string, { expected: string; paid: string; refunded: string }> }>(`/api/v1/finance/cash-sessions/${session.id}/preview`)
        const preview = response.data
        setSettlementPreview(preview)
        const prefilled: Record<string, string> = {}
        for (const [method, info] of Object.entries(preview.breakdown)) {
          prefilled[method] = info.expected
        }
        setTenderActuals(prefilled)
      } catch {
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

  const initEqualSplits = useCallback((count: number, orderTotal: number) => {
    const base = Math.floor(orderTotal / count)
    const remainder = orderTotal - base * count
    const items: SplitPaymentItem[] = Array.from({ length: count }, (_, i) => ({
      id: `split-${i + 1}-${Date.now()}`,
      method: "cash",
      amount: i === 0 ? base + remainder : base,
      label: `Orang #${i + 1}`,
    }))
    setSplitPayments(items)
  }, [])

  const addCustomSplitPayment = useCallback(() => {
    setSplitPayments((current) => {
      const currentAllocated = current.reduce((sum, item) => sum + item.amount, 0)
      const remaining = Math.max(0, total - currentAllocated)
      return [
        ...current,
        {
          id: `split-${current.length + 1}-${Date.now()}`,
          method: "cash",
          amount: remaining,
          label: `Pembayaran #${current.length + 1}`,
        },
      ]
    })
  }, [total])

  const updateSplitPayment = (id: string, patch: Partial<SplitPaymentItem>) => {
    setSplitPayments((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  }

  const removeSplitPayment = (id: string) => {
    setSplitPayments((current) => current.filter((item) => item.id !== id))
  }

  function selectPaymentMethod(name: string) {
    setPaymentMethod(name)
    if (name === "Split Bill" && (!splitPayments.length || splitMode === "equal")) {
      initEqualSplits(splitCount, total)
    }
  }

  const splitTotalPaid = splitPayments.reduce((sum, item) => sum + item.amount, 0)
  const splitRemaining = Math.max(0, total - splitTotalPaid)
  const totalCashChange = paymentMethod === "Split Bill"
    ? splitPayments.reduce((sum, item) => (item.method === "cash" && (item.cashTendered ?? 0) > item.amount ? sum + ((item.cashTendered ?? 0) - item.amount) : sum), 0)
    : (paymentMethod === "Tunai" && cash > total ? cash - total : 0)

  const orderSignature = JSON.stringify([
    branch?.id, warehouse?.id, session?.id, customerId, orderNote, discountAmount, paymentMethod, cash, splitPayments,
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
      const next = Math.max(0, item.quantity + changeBy)
      if (item.trackStock && next > item.stock) { showError("Jumlah melebihi stok tersedia"); return item }
      return { ...item, quantity: next }
    }))
  }

  function updateQuantity(id: string, qty: number) {
    const validQty = Math.max(0, qty)
    setCart((current) => current.map((item) => {
      if (item.id !== id) return item
      if (item.trackStock && validQty > item.stock) {
        showError("Jumlah melebihi stok tersedia")
        return { ...item, quantity: item.stock }
      }
      return { ...item, quantity: validQty }
    }))
  }

  async function submitOrder(status: "paid" | "held") {
    if (!branch?.id || !warehouse?.id) return showError("Cabang atau gudang belum dipilih")
    if (!session) return showError("Buka shift kasir sebelum transaksi")
    const validCartItems = cart.filter((item) => item.quantity > 0)
    if (!validCartItems.length) return showError("Keranjang tidak memiliki produk dengan jumlah > 0")

    let finalNote = orderNote
    if (selectedTableId) {
      const tbl = tableResource.data.find((t) => t.id === selectedTableId)
      if (tbl) finalNote = finalNote ? `${finalNote} • Meja: ${tbl.name}` : `Meja: ${tbl.name}`
    }

    if (status === "held") {
      setSubmitting(true)
      try {
        await apiFetch("/api/v1/pos/hold", {
          method: "POST",
          body: JSON.stringify({
            items: validCartItems.map((item) => ({ variantId: item.id, quantity: item.quantity, unitPrice: String(item.price) })),
            customerId,
            orderNotes: finalNote || undefined,
            discountAmount: String(discountAmount),
          }),
        })
        showSuccess("Pesanan berhasil ditahan")
        setCart([])
        setOrderNote("")
        setDiscount("0")
        setSelectedTableId("")
        await loadHeldOrders()
      } catch (e) {
        showError(e instanceof Error ? e.message : "Gagal menahan pesanan")
      } finally {
        setSubmitting(false)
      }
      return
    }

    let paymentsPayload: { method: "cash" | "debit" | "credit" | "qris" | "e_wallet" | "transfer" | "pay_later" | "store_credit"; amount: string }[] = []

    if (status === "paid") {
      if (paymentMethod === "Tunai") {
        if (cash < total) return showError("Nominal tunai belum cukup")
        paymentsPayload = [{ method: "cash", amount: String(cash) }]
      } else if (paymentMethod === "Split Bill") {
        if (splitTotalPaid < total) {
          return showError(`Total alokasi split bill (${rupiah(splitTotalPaid)}) belum memenuhi total tagihan (${rupiah(total)})`)
        }
        paymentsPayload = splitPayments.map((item) => ({
          method: item.method,
          amount: String(item.amount),
        }))
      } else {
        const selected = paymentMethods.find(([name]) => name === paymentMethod)!
        paymentsPayload = [{ method: selected[1] as "cash" | "debit" | "credit" | "qris" | "e_wallet" | "transfer" | "pay_later" | "store_credit", amount: String(total) }]
      }
    }

    setSubmitting(true)
    try {
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
          notes: finalNote || undefined,
          discountAmount: String(discountAmount),
          serviceChargeAmount: "0",
          offlineReference: requestKey,
          items: validCartItems.map((item) => ({ variantId: item.id, quantity: String(item.quantity), unitPriceAmount: String(item.price), discountAmount: "0" })),
          payments: status === "paid" ? paymentsPayload : [],
        }),
      })
      if (response.queued) {
        showWarning("Transaksi disimpan offline, akan disinkronkan saat koneksi kembali")
        setPaymentOpen(false); setCart([]); setOrderNote(""); setDiscount("0"); setSelectedTableId(""); return
      }
      showSuccess("Pembayaran berhasil")
      playPosChimeSound()
      setReceipt(response.data)
      await Promise.all([balanceResource.refresh(), productResource.refresh(), variantResource.refresh()])
    } catch (caught) { showError(caught instanceof Error ? caught.message : "Transaksi gagal") }
    finally { setSubmitting(false) }
  }

  function newOrder() {
    setReceipt(undefined)
    setPaymentOpen(false)
    setCart([])
    setCashAmount("")
    setOrderNote("")
    setDiscount("0")
    setCustomerId(undefined)
    setSelectedTableId("")
    setSplitPayments([])
    setPaymentMethod("Tunai")
  }

  const shiftDialog = session ? <Dialog open={shiftOpen} onOpenChange={setShiftOpen}><DialogContent><DialogHeader><DialogTitle>Kelola shift kasir</DialogTitle><DialogDescription>{session.registerName} • dibuka {new Date(session.openedAt).toLocaleString("id-ID")}</DialogDescription></DialogHeader><div className="grid grid-cols-2 gap-2"><Button type="button" variant={shiftMode === "movement" ? "default" : "outline"} onClick={() => setShiftMode("movement")}>Mutasi kas</Button><Button type="button" variant={shiftMode === "close" ? "destructive" : "outline"} onClick={() => setShiftMode("close")}>Tutup shift</Button></div>{shiftMode === "movement" ? <form onSubmit={recordMovement} className="space-y-4"><div className="space-y-2"><Label>Jenis</Label><Select value={movement.direction} onValueChange={(value: "in" | "out") => setMovement((current) => ({ ...current, direction: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="in">Kas masuk</SelectItem><SelectItem value="out">Kas keluar</SelectItem></SelectContent></Select></div><div className="space-y-2"><Label htmlFor="movement-amount">Nominal</Label><Input id="movement-amount" type="number" min="1" step="1" value={movement.amount} onChange={(event) => setMovement((current) => ({ ...current, amount: event.target.value }))} required /></div><div className="space-y-2"><Label htmlFor="movement-category">Kategori</Label><Input id="movement-category" value={movement.category} onChange={(event) => setMovement((current) => ({ ...current, category: event.target.value }))} placeholder="Modal tambahan / petty cash" minLength={2} required /></div><div className="space-y-2"><Label htmlFor="movement-reason">Alasan</Label><Input id="movement-reason" value={movement.reason} onChange={(event) => setMovement((current) => ({ ...current, reason: event.target.value }))} minLength={3} required /></div><DialogFooter><Button type="submit" className="bg-emerald-600 hover:bg-emerald-700" disabled={submitting}>{submitting && <Loader2 className="animate-spin" />} Simpan mutasi</Button></DialogFooter></form> : <form onSubmit={closeShift} className="space-y-4"><p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">Hitung uang fisik di laci kasir. Sistem menghitung ekspektasi dan selisih otomatis.</p>{settlementPreview && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-900 dark:bg-emerald-950"><p className="text-sm text-muted-foreground">Kas seharusnya</p><p className="text-xl font-bold text-emerald-700 dark:text-emerald-300">{rupiah(Number(settlementPreview.expectedCash))}</p></div>}<div className="grid grid-cols-2 gap-3">{paymentMethods.map(([name, method]) => { const expected = settlementPreview?.breakdown?.[method]?.expected; return <div key={method} className="space-y-2"><Label htmlFor={`actual-${method}`}>{name} aktual{expected !== undefined && <span className="ml-1 text-xs font-normal text-muted-foreground">(seharusnya {rupiah(Number(expected))})</span>}</Label><Input id={`actual-${method}`} type="number" min="0" step="1" value={tenderActuals[method] ?? ""} onChange={(event) => setTenderActuals((current) => ({ ...current, [method]: event.target.value }))} required /></div> })}</div><div className="space-y-2"><Label htmlFor="settlement-notes">Catatan</Label><Textarea id="settlement-notes" value={settlementNotes} onChange={(event) => setSettlementNotes(event.target.value)} placeholder="Opsional: jelaskan jika ada selisih" /></div>{cart.length > 0 && <div className="flex items-center justify-between rounded-lg bg-rose-50 p-3 dark:bg-rose-950/40 text-xs text-rose-700 dark:text-rose-300 font-medium"><span>Keranjang masih berisi item ({cart.length} produk)</span><Button type="button" variant="destructive" size="sm" className="h-7 text-xs" onClick={() => setCart([])}>Kosongkan Keranjang</Button></div>}<DialogFooter><Button type="submit" variant="destructive" disabled={submitting || cart.length > 0}>{submitting && <Loader2 className="animate-spin" />} Tutup dan rekonsiliasi</Button></DialogFooter></form>}</DialogContent></Dialog> : null

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
    return <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-muted/30 p-4"><Card className="w-full max-w-md shadow-xl"><CardContent className="p-7 text-center"><span className="mx-auto flex size-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><ReceiptText className="size-8" /></span><h2 className="mt-5 text-2xl font-bold">Pembayaran berhasil</h2><p className="mt-1 text-sm text-muted-foreground">{number}</p><div className="my-6 space-y-3 rounded-xl bg-muted/60 p-4 text-left"><div className="flex justify-between"><span>Total</span><strong>{rupiah(receiptTotal)}</strong></div><div className="flex justify-between"><span>Metode</span><strong>{paymentMethod}</strong></div>{paymentMethod === "Split Bill" && splitPayments.length > 0 && <div className="space-y-1 text-xs text-muted-foreground border-t border-dashed pt-2">{splitPayments.map((sp, idx) => <div key={sp.id} className="flex justify-between"><span>{sp.label || `Pembayaran #${idx + 1}`} ({sp.method.toUpperCase()})</span><span>{rupiah(sp.amount)}</span></div>)}</div>}{paymentMethod === "Tunai" && <div className="flex justify-between"><span>Kembalian</span><strong>{rupiah(receiptChange)}</strong></div>}{totalCashChange > 0 && paymentMethod === "Split Bill" && <div className="flex justify-between text-emerald-600 font-semibold"><span>Kembalian Tunai</span><strong>{rupiah(totalCashChange)}</strong></div>}<Separator /><p className="break-all text-xs text-muted-foreground">Kode verifikasi: {verification}</p></div><div className="grid grid-cols-2 gap-2 print:hidden"><Button variant="outline" onClick={() => window.print()}><ReceiptText /> Cetak</Button><Button className="bg-emerald-600 hover:bg-emerald-700" onClick={newOrder}>Transaksi baru</Button></div></CardContent></Card></div>
  }

  if (paymentOpen) {
    return <div className="flex min-h-[calc(100vh-4rem)] flex-col bg-muted/30 p-4 md:p-6"><div className="mx-auto w-full max-w-5xl"><Button variant="ghost" className="mb-4" onClick={() => setPaymentOpen(false)}><ChevronLeft /> Kembali ke keranjang</Button><div className="grid gap-5 lg:grid-cols-[1fr_0.8fr]"><Card><CardContent className="p-6"><h2 className="text-xl font-bold">Pilih metode pembayaran</h2><p className="mt-1 text-sm text-muted-foreground">Transaksi akan disimpan ke database dan stok langsung berkurang.</p><div className="mt-6 grid grid-cols-2 gap-3">{paymentMethods.map(([name, , Icon]) => <Button key={name} variant={paymentMethod === name ? "default" : "outline"} className={`h-24 flex-col gap-2 ${paymentMethod === name ? "bg-emerald-600 hover:bg-emerald-700" : ""}`} onClick={() => selectPaymentMethod(name)}><Icon className="size-6" />{name}</Button>)}</div>{paymentMethod === "Tunai" && <div className="mt-6 space-y-3"><Label>Uang diterima</Label><Input value={cashAmount} onChange={(event) => setCashAmount(event.target.value)} placeholder="Rp 0" className="h-14 text-xl font-semibold" /><div className="grid grid-cols-4 gap-2"><Button type="button" variant="secondary" size="sm" className="col-span-4 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-300 font-semibold" onClick={() => setCashAmount(String(total))}>Uang Pas ({rupiah(total)})</Button>{[50000, 100000, 150000, 200000].map((amount) => <Button key={amount} type="button" variant="outline" size="sm" onClick={() => setCashAmount(String(amount))}>{amount / 1000}rb</Button>)}</div></div>}{paymentMethod === "Split Bill" && <div className="mt-6 space-y-5 rounded-xl border bg-card p-4 sm:p-5 shadow-xs"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="font-semibold text-foreground">Mode Split Bill</h3><p className="text-xs text-muted-foreground">Bagi pembayaran rata per orang atau alokasi nominal custom.</p></div><div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 text-xs font-medium"><button type="button" className={`rounded-md px-3 py-1.5 transition ${splitMode === "equal" ? "bg-background shadow-xs font-semibold text-foreground" : "text-muted-foreground hover:text-foreground"}`} onClick={() => { setSplitMode("equal"); initEqualSplits(splitCount, total) }}>Bagi Rata</button><button type="button" className={`rounded-md px-3 py-1.5 transition ${splitMode === "custom" ? "bg-background shadow-xs font-semibold text-foreground" : "text-muted-foreground hover:text-foreground"}`} onClick={() => setSplitMode("custom")}>Nominal Custom</button></div></div>{splitMode === "equal" && <div className="flex items-center justify-between rounded-lg bg-muted/50 p-3"><span className="text-sm font-medium">Jumlah Orang / Bagian:</span><div className="flex items-center gap-2"><Button type="button" variant="outline" size="icon" className="size-8" onClick={() => { const next = Math.max(2, splitCount - 1); setSplitCount(next); initEqualSplits(next, total) }}><Minus className="size-3" /></Button><span className="w-8 text-center text-base font-bold">{splitCount}</span><Button type="button" variant="outline" size="icon" className="size-8" onClick={() => { const next = Math.min(20, splitCount + 1); setSplitCount(next); initEqualSplits(next, total) }}><Plus className="size-3" /></Button></div></div>}<div className="space-y-3">{splitPayments.map((item, index) => { const itemCashChange = item.method === "cash" && (item.cashTendered ?? 0) > item.amount ? (item.cashTendered! - item.amount) : 0; return <div key={item.id} className="rounded-lg border bg-background p-3 space-y-3"><div className="flex items-center justify-between"><span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{item.label || `Pembayaran #${index + 1}`}</span>{splitMode === "custom" && splitPayments.length > 1 && <Button type="button" variant="ghost" size="icon" className="size-7 text-destructive" onClick={() => removeSplitPayment(item.id)}><Trash2 className="size-3.5" /></Button>}</div><div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><div><Label className="text-xs">Metode Bayar</Label><Select value={item.method} onValueChange={(val: "cash" | "qris" | "debit") => updateSplitPayment(item.id, { method: val })}><SelectTrigger className="h-10 text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="cash">Tunai (Cash)</SelectItem><SelectItem value="qris">QRIS</SelectItem><SelectItem value="debit">Kartu (Debit/Kredit)</SelectItem></SelectContent></Select></div><div><Label className="text-xs">Nominal Tagihan (Rp)</Label><Input type="number" min="0" className="h-10 text-sm font-semibold" value={item.amount || ""} disabled={splitMode === "equal"} onChange={(e) => updateSplitPayment(item.id, { amount: Number(e.target.value) || 0 })} /></div></div>{item.method === "cash" && <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-dashed"><div><Label className="text-xs text-muted-foreground">Uang Diterima (Opsional)</Label><Input type="number" placeholder={`Rp ${item.amount.toLocaleString("id-ID")}`} className="h-9 text-xs" value={item.cashTendered || ""} onChange={(e) => updateSplitPayment(item.id, { cashTendered: Number(e.target.value) || 0 })} /></div>{itemCashChange > 0 && <div className="flex flex-col justify-center rounded bg-emerald-50 px-3 py-1 text-xs text-emerald-700 font-medium"><span>Kembalian Slot Ini:</span><strong className="text-sm">{rupiah(itemCashChange)}</strong></div>}</div>}</div> })}</div>{splitMode === "custom" && <Button type="button" variant="outline" className="w-full border-dashed" onClick={addCustomSplitPayment}><Plus className="mr-2 size-4" /> Tambah Pembayaran Split</Button>}<div className={`rounded-xl p-4 border ${splitTotalPaid >= total ? "bg-emerald-50/70 border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-900" : "bg-amber-50/70 border-amber-200 dark:bg-amber-950/40 dark:border-amber-900"}`}><div className="flex justify-between text-xs font-medium text-muted-foreground mb-1"><span>Total Tagihan Order</span><span>{rupiah(total)}</span></div><div className="flex justify-between text-sm font-semibold mb-1"><span>Total Teralokasi Split</span><span>{rupiah(splitTotalPaid)}</span></div><Separator className="my-2" />{splitRemaining > 0 ? <div className="flex justify-between text-sm font-bold text-amber-700 dark:text-amber-400"><span>Sisa Belum Terbayar</span><span>{rupiah(splitRemaining)}</span></div> : <div className="flex justify-between text-sm font-bold text-emerald-700 dark:text-emerald-400"><span>Status Pembayaran</span><span>LUNAS ✓ {totalCashChange > 0 ? `(Kembalian ${rupiah(totalCashChange)})` : ""}</span></div>}</div></div>}</CardContent></Card><Card className="h-fit"><CardContent className="p-6"><h3 className="font-semibold">Ringkasan pembayaran</h3><div className="mt-5 space-y-3 text-sm"><div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{rupiah(subtotal)}</span></div>{discountAmount > 0 && <div className="flex justify-between text-rose-600"><span>Diskon</span><span>-{rupiah(discountAmount)}</span></div>}<div className="flex justify-between"><span className="text-muted-foreground">Pajak</span><span>{rupiah(tax)}</span></div><Separator /><div className="flex justify-between text-xl font-bold"><span>Total</span><span className="text-emerald-600">{rupiah(total)}</span></div>{paymentMethod === "Tunai" && cash >= total && <div className="flex justify-between rounded-lg bg-emerald-50 p-3 font-medium text-emerald-700"><span>Kembalian</span><span>{rupiah(cash - total)}</span></div>}{paymentMethod === "Split Bill" && splitTotalPaid >= total && <div className="flex justify-between rounded-lg bg-emerald-50 p-3 font-medium text-emerald-700"><span>Split Status</span><span>LUNAS</span></div>}</div><Button className="mt-6 h-14 w-full bg-emerald-600 text-base hover:bg-emerald-700" onClick={() => void submitOrder("paid")} disabled={submitting || (paymentMethod === "Split Bill" && splitTotalPaid < total)}>{submitting ? <Loader2 className="animate-spin" /> : <ReceiptText />} Bayar {rupiah(total)}</Button></CardContent></Card></div></div></div>
  }

  const heldDialog = (
    <Dialog open={heldOpen} onOpenChange={setHeldOpen}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-700 dark:text-amber-400"><Clock className="size-5" /> Pesanan Ditahan ({heldList.length})</DialogTitle>
          <DialogDescription>Daftar transaksi sementara yang ditahan oleh kasir.</DialogDescription>
        </DialogHeader>
        {heldLoading ? (
          <div className="flex h-36 items-center justify-center"><Loader2 className="size-7 animate-spin text-emerald-600" /></div>
        ) : !heldList.length ? (
          <div className="py-10 text-center text-sm text-muted-foreground">Tidak ada pesanan ditahan saat ini.</div>
        ) : (
          <ScrollArea className="max-h-96 pr-2">
            <div className="space-y-3">
              {heldList.map((held) => {
                const count = held.cartData.items.reduce((sum, i) => sum + i.quantity, 0)
                const totalEst = held.cartData.items.reduce((sum, i) => sum + (Number(i.unitPrice) || 0) * i.quantity, 0)
                return (
                  <div key={held.id} className="rounded-xl border bg-card p-3 space-y-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground">{new Date(held.createdAt).toLocaleString("id-ID")}</p>
                        {held.cartData.orderNotes && <p className="text-xs font-medium text-foreground mt-0.5">{held.cartData.orderNotes}</p>}
                        <p className="text-xs text-emerald-600 font-bold mt-1">{count} item • Estimasi {rupiah(totalEst)}</p>
                      </div>
                      <Button type="button" variant="ghost" size="icon" className="size-7 text-destructive" onClick={() => void discardHeld(held.id)}><Trash2 className="size-3.5" /></Button>
                    </div>
                    <Button type="button" className="w-full h-8 text-xs bg-emerald-600 hover:bg-emerald-700" onClick={() => void resumeHeldOrder(held)}>Muat ke Keranjang (Resume)</Button>
                  </div>
                )
              })}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  )

  return <div className="grid min-h-[calc(100vh-4rem)] grid-cols-1 bg-muted/30 xl:grid-cols-[1fr_430px]">{shiftDialog}{heldDialog}<section className="min-w-0 p-4 md:p-5"><div className="mb-4 flex flex-col gap-3 rounded-xl border bg-background p-3.5 sm:flex-row sm:items-center sm:justify-between shadow-xs"><div><p className="flex items-center gap-2 font-semibold text-foreground"><Store className="size-4 text-emerald-600" />{session.registerName} <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900"><span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />Shift aktif</span></p><p className="mt-1 text-xs text-muted-foreground">{branches.find((cabang) => cabang.id === session.branchId)?.name ? `${branches.find((cabang) => cabang.id === session.branchId)?.name} • ` : ""}Kas awal {rupiah(Number(session.openingAmount))} • {new Date(session.openedAt).toLocaleString("id-ID")}{session.shiftHours ? ` • Jaga ${session.shiftHours} jam` : ""}</p></div><div className="flex gap-2"><Button size="sm" variant="outline" className="relative shadow-2xs" onClick={() => { void loadHeldOrders(); setHeldOpen(true) }}><Clock className="size-4" /> Ditahan {heldList.length > 0 && <Badge variant="secondary" className="ml-1 bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">{heldList.length}</Badge>}</Button><Button size="sm" variant="outline" className="shadow-2xs" onClick={() => showShift("movement")}><Banknote /> Mutasi kas</Button><Button size="sm" variant="destructive" className="shadow-2xs" onClick={() => showShift("close")}>Tutup shift</Button></div></div><div className="mb-4 flex gap-2"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" /><Input className="h-12 bg-background pl-10 text-sm font-medium shadow-xs" placeholder="Cari produk, SKU, atau barcode... (Ketik nama/scan)" value={search} onChange={(event) => setSearch(event.target.value)} autoFocus /></div><Button variant="outline" size="icon" className="size-12 bg-background shadow-xs" onClick={() => showInfo("Masukkan barcode pada kolom pencarian")}><Barcode className="size-5" /></Button></div><ScrollArea className="mb-4 w-full whitespace-nowrap"><div className="flex gap-2 pb-2">{categories.map((item) => <Button key={item} size="sm" variant={category === item ? "default" : "outline"} className={category === item ? "bg-emerald-600 hover:bg-emerald-700 shadow-xs" : "bg-background shadow-2xs"} onClick={() => setCategory(item)}>{item}</Button>)}</div></ScrollArea>{loading && <div className="flex h-64 items-center justify-center"><Loader2 className="size-7 animate-spin text-emerald-600" /></div>}{!loading && !filtered.length && <div className="flex h-64 flex-col items-center justify-center text-center"><ShoppingCart className="size-10 text-muted-foreground/30" /><p className="mt-3 font-medium">Produk tidak ditemukan</p><p className="text-sm text-muted-foreground">Tambahkan produk dan stok dari menu Produk.</p></div>}<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">{filtered.map((product, index) => { const isOut = product.trackStock && product.stock <= 0; const isLow = product.trackStock && product.stock > 0 && product.stock <= 5; return <button key={product.id} disabled={isOut} className="group overflow-hidden rounded-xl border bg-card text-left shadow-xs transition-all duration-200 hover:-translate-y-1 hover:border-emerald-400 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50" onClick={() => add(product)}><div className={`flex aspect-[1.5] items-center justify-center text-4xl transition-transform duration-200 group-hover:scale-105 ${colors[index % colors.length]}`}>{emojis[index % emojis.length]}</div><div className="p-3"><p className="truncate text-sm font-semibold text-foreground">{product.name}</p><p className="mt-1 text-sm font-bold text-emerald-600 dark:text-emerald-400">{rupiah(product.price)}</p><div className="mt-2 flex items-center justify-between">{isOut ? <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Stok Habis</Badge> : isLow ? <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">Stok {product.stock}</Badge> : <p className="truncate text-xs text-muted-foreground">{product.sku} • Stok {product.trackStock ? product.stock : "∞"}</p>}</div></div></button> })}</div></section><aside className="flex min-h-[600px] flex-col border-l bg-background xl:h-[calc(100vh-4rem)]"><div className="flex items-center justify-between border-b p-4"><div><h2 className="flex items-center gap-2 font-bold"><ShoppingCart className="size-5 text-emerald-600" /> Keranjang <Badge className="bg-emerald-600">{cart.reduce((sum, item) => sum + item.quantity, 0)}</Badge></h2><p className="mt-0.5 text-xs text-muted-foreground">{branch?.name} • {warehouse?.name}</p></div>{cart.length > 0 && <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground hover:text-destructive" onClick={() => setCart([])}><Trash2 className="mr-1 size-3.5" /> Kosongkan</Button>}</div><div className="grid grid-cols-2 gap-2 border-b p-3"><Select value={customerId} onValueChange={setCustomerId}><SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Pilih pelanggan" /></SelectTrigger><SelectContent>{customerResource.data.filter((item) => item.is_active).map((item) => <SelectItem key={item.id} value={item.id}>{item.name} • {item.code}</SelectItem>)}</SelectContent></Select><Select value={selectedTableId} onValueChange={setSelectedTableId}><SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Pilih meja" /></SelectTrigger><SelectContent><SelectItem value="takeaway">Tanpa Meja (Takeaway)</SelectItem>{tableResource.data.filter((t) => t.is_active).map((t) => <SelectItem key={t.id} value={t.id}>{t.name} (Cap {t.capacity})</SelectItem>)}</SelectContent></Select></div><ScrollArea className="min-h-0 flex-1"><div className="space-y-2 p-3">{!cart.length && <div className="py-16 text-center"><ShoppingCart className="mx-auto size-12 text-muted-foreground/30" /><p className="mt-4 font-medium">Keranjang kosong</p></div>}{cart.map((item) => <div key={item.id} className="rounded-xl border p-3 bg-card shadow-2xs"><div className="flex items-start gap-3"><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{item.name}</p><p className="text-xs text-muted-foreground">{rupiah(item.price)} • {item.sku}</p></div><Button variant="ghost" size="icon" className="size-8 text-destructive" onClick={() => setCart((current) => current.filter((entry) => entry.id !== item.id))}><Trash2 className="size-4" /></Button></div><div className="mt-3 flex items-center justify-between"><div className="flex items-center rounded-lg border bg-background"><Button variant="ghost" size="icon" className="size-8" onClick={() => change(item.id, -1)}><Minus className="size-3" /></Button><Input type="number" min="0" placeholder="0" className="h-8 w-12 border-0 bg-transparent text-center p-0 text-sm font-semibold focus-visible:ring-0 focus-visible:ring-offset-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" value={item.quantity === 0 ? "" : item.quantity} onChange={(e) => { const val = e.target.value === "" ? 0 : parseInt(e.target.value, 10); updateQuantity(item.id, isNaN(val) ? 0 : val) }} onFocus={(e) => e.target.select()} /><Button variant="ghost" size="icon" className="size-8" onClick={() => change(item.id, 1)}><Plus className="size-3" /></Button></div><p className="font-bold text-foreground">{rupiah(item.price * item.quantity)}</p></div></div>)}</div></ScrollArea><div className="border-t p-4 bg-background"><div className="mb-3 grid grid-cols-2 gap-2"><Textarea placeholder="Catatan pesanan" className="min-h-16 resize-none text-xs" value={orderNote} onChange={(event) => setOrderNote(event.target.value)} /><div><Label className="text-xs">Diskon order</Label><Input type="number" min="0" className="h-9 text-xs" value={discount} onChange={(event) => setDiscount(event.target.value)} /></div></div><div className="space-y-2 text-sm"><div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{rupiah(subtotal)}</span></div>{discountAmount > 0 && <div className="flex justify-between text-rose-600"><span>Diskon</span><span>-{rupiah(discountAmount)}</span></div>}<div className="flex justify-between"><span className="text-muted-foreground">Pajak</span><span>{rupiah(tax)}</span></div><Separator /><div className="flex justify-between text-lg font-bold"><span>Total</span><span className="text-emerald-600 dark:text-emerald-400">{rupiah(total)}</span></div></div><div className="mt-4 grid grid-cols-[auto_1fr] gap-2"><Button variant="outline" size="icon" className="size-12 shadow-2xs" onClick={() => void submitOrder("held")} disabled={!cart.length || submitting}><PauseCircle className="size-5" /></Button><Button disabled={!cart.length} className="h-12 bg-emerald-600 text-base font-bold hover:bg-emerald-700 shadow-md shadow-emerald-600/20" onClick={() => setPaymentOpen(true)}>Bayar • {rupiah(total)}</Button></div></div></aside></div>
}
