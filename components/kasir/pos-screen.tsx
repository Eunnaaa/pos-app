"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import QRCode from "qrcode"
import {
  Banknote,
  Barcode,
  Bluetooth,
  ChevronLeft,
  Clock,
  CreditCard,
  Loader2,
  Minus,
  Plus,
  Printer,
  QrCode,
  ReceiptText,
  RefreshCw,
  Search,
  ShoppingCart,
  Store,
  Trash2,
  WifiOff,
} from "lucide-react"
import { showError, showInfo, showSuccess, showWarning } from "@/lib/toast-handler"
import { playPosChimeSound } from "@/lib/services/sound-alert"
import {
  connectBluetoothPrinter,
  getConnectedPrinterName,
  printDirectThermal,
  type PrinterWidth,
  type ReceiptData,
} from "@/lib/services/escpos-printer"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { useOrganization } from "@/components/kasir/organization-provider"
import { ONLINE_RESERVATION_MS } from "@/lib/online-reservation-policy"
import { usePosBootstrap, type PosProduct } from "@/hooks/use-pos-bootstrap"
import { usePosCart, type PosCartItem } from "@/hooks/use-pos-cart"
import { usePosNetworkState } from "@/hooks/use-pos-network-state"
import {
  usePosPaymentState,
  type CheckoutQuote,
  type CheckoutResult,
  type SplitPaymentItem,
} from "@/hooks/use-pos-payment-state"
import { apiFetch } from "@/lib/client"
import { getCategoryEmoji, getCategoryColor } from "@/lib/services/category-images"
import { PosCartPanel } from "@/components/kasir/pos/cart-panel"

export type Product = PosProduct
type CashSession = { id: string; openingAmount: string; openedAt: string; registerName: string; registerCode: string; shiftHours?: number; branchId?: string }
type ClosedCashSession = { expectedClosingAmount: string; actualClosingAmount: string; varianceAmount: string }
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
const rupiah = (amount: number) => `Rp ${amount.toLocaleString("id-ID")}`
const pendingQrisStorageKey = (branchId: string) => `kedai-ku-pos-pending-qris:${branchId}`

export function PosScreen() {
  const { branch, warehouse, selectBranch, organization } = useOrganization()
  const posBootstrap = usePosBootstrap(branch?.id, warehouse?.id)
  const { products, categories, customers, tables, loading, error: catalogError, refresh: refreshBootstrap } = posBootstrap
  const searchInputRef = useRef<HTMLInputElement>(null)

  const [search, setSearch] = useState("")
  const [category, setCategory] = useState("Semua")
  const {
    cart,
    setCart,
    customerId,
    setCustomerId,
    selectedTableId,
    setSelectedTableId,
    orderNote,
    setOrderNote,
    discount,
    setDiscount,
    promotionCode,
    setPromotionCode,
    voucherCode,
    setVoucherCode,
    add,
    changeQuantity,
    setQuantity,
    remove: removeCartItem,
    clear: clearCart,
    reset: resetCart,
  } = usePosCart()
  const [mobileCartOpen, setMobileCartOpen] = useState(false)

  // Held Orders State
  const [heldOpen, setHeldOpen] = useState(false)
  const [heldList, setHeldList] = useState<HeldOrder[]>([])
  const [heldLoading, setHeldLoading] = useState(false)
  const {
    paymentOpen,
    setPaymentOpen,
    paymentMethod,
    setPaymentMethod,
    cashAmount,
    setCashAmount,
    quote,
    setQuote,
    quoteLoading,
    setQuoteLoading,
    quoteError,
    setQuoteError,
    submitting,
    setSubmitting,
    receipt,
    setReceipt,
    pendingQrisOrder,
    setPendingQrisOrder,
    qrisPollingError,
    setQrisPollingError,
    splitMode,
    setSplitMode,
    splitCount,
    setSplitCount,
    splitPayments,
    setSplitPayments,
    orderKey,
    setOrderKey,
  } = usePosPaymentState()
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
  // Bluetooth Thermal Printer & Offline Queue State
  const [printerName, setPrinterName] = useState<string | null>(null)
  const [printerWidth, setPrinterWidth] = useState<PrinterWidth>(58)
  const [printingThermal, setPrintingThermal] = useState(false)
  const { offlineCount, isOnline, syncingOffline, syncNow } = usePosNetworkState()
  const [dynamicStoreQrisUrl, setDynamicStoreQrisUrl] = useState("")
  useEffect(() => {
    setPrinterName(getConnectedPrinterName())
  }, [])

  async function handleConnectPrinter() {
    try {
      const name = await connectBluetoothPrinter()
      setPrinterName(name)
      showSuccess(`Printer Bluetooth terhubung: ${name}`)
    } catch (e) {
      showError(e instanceof Error ? e.message : "Gagal menghubungkan printer Bluetooth")
    }
  }

  async function handleDirectThermalPrint(targetReceipt: CheckoutResult) {
    setPrintingThermal(true)
    try {
      const number = targetReceipt.order.orderNumber || targetReceipt.order.order_number || targetReceipt.order.id
      const totalAmt = Number(targetReceipt.order.totalAmount || targetReceipt.order.total_amount || total)
      const changeAmt = Number(targetReceipt.order.changeAmount || targetReceipt.order.change_amount || 0)
      const verification = targetReceipt.receipt?.verificationToken || targetReceipt.receipt?.verification_token

      const receiptData: ReceiptData = {
        storeName: organization?.name || "Kedai-Ku",
        branchName: branch?.name,
        orderNumber: String(number),
        cashierName: session?.registerName || "Kasir",
        tableName: selectedTableId === "takeaway" ? "Takeaway" : tables.find((t) => t.id === selectedTableId)?.name,
        diningType: selectedTableId === "takeaway" ? "takeaway" : "dine_in",
        date: new Date(),
        items: cart.filter((i) => i.quantity > 0).map((i) => ({
          name: i.name,
          quantity: i.quantity,
          price: i.price,
        })),
        subtotal,
        discountAmount: totalDiscountAmount,
        taxAmount: tax,
        total: totalAmt,
        paymentMethod: paymentMethod,
        cashReceived: paymentMethod === "Tunai" ? Number(cashAmount || total) : undefined,
        changeAmount: changeAmt > 0 ? changeAmt : totalCashChange > 0 ? totalCashChange : undefined,
        verificationCode: verification || undefined,
      }

      await printDirectThermal(receiptData, printerWidth)
      setPrinterName(getConnectedPrinterName())
      showSuccess("Struk berhasil dicetak langsung ke printer thermal!")
    } catch (e) {
      showError(e instanceof Error ? e.message : "Gagal mencetak thermal. Pastikan printer Bluetooth menyala.")
    } finally {
      setPrintingThermal(false)
    }
  }

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
    window.addEventListener("kedai-ku-context-change", refresh)
    return () => window.removeEventListener("kedai-ku-context-change", refresh)
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
      const restoredItems: PosCartItem[] = []
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


  const barcodeMap = useMemo(() => {
    const map = new Map<string, Product>()
    for (const p of products) {
      if (p.barcode) map.set(p.barcode.trim().toLowerCase(), p)
      if (p.sku) map.set(p.sku.trim().toLowerCase(), p)
    }
    return map
  }, [products])

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query && category === "Semua") return products
    return products.filter((product) => {
      const matchesCategory = category === "Semua" || product.category === category
      if (!matchesCategory) return false
      if (!query) return true
      return (
        product.name.toLowerCase().includes(query) ||
        product.sku.toLowerCase().includes(query) ||
        (product.barcode ? product.barcode.toLowerCase().includes(query) : false)
      )
    })
  }, [products, category, search])

  const [visibleLimit, setVisibleLimit] = useState(48)
  useEffect(() => {
    setVisibleLimit(48)
  }, [category, search])

  const visibleProducts = useMemo(() => {
    return filtered.slice(0, visibleLimit)
  }, [filtered, visibleLimit])
  const localSubtotal = cart.reduce((total, item) => total + item.price * item.quantity, 0)
  const discountAmount = Math.min(Number(discount) || 0, localSubtotal)
  const quoteSignature = JSON.stringify([
    branch?.id,
    warehouse?.id,
    customerId,
    discountAmount,
    promotionCode.trim().toUpperCase(),
    voucherCode.trim().toUpperCase(),
    cart.map((item) => [item.id, item.quantity]),
  ])

  const requestCheckoutQuote = useCallback(async (sourceItems: PosCartItem[]) => {
    if (!branch?.id || !warehouse?.id || !sourceItems.length) throw new Error("Cabang, gudang, dan item wajib dipilih")
    const response = await apiFetch<CheckoutQuote>("/api/v1/pos/quote", {
      method: "POST",
      body: JSON.stringify({
        branchId: branch.id,
        warehouseId: warehouse.id,
        customerId,
        status: "pending",
        discountAmount: String(discountAmount),
        serviceChargeAmount: "0",
        promotionCode: promotionCode.trim().toUpperCase() || undefined,
        voucherCode: voucherCode.trim().toUpperCase() || undefined,
        items: sourceItems.map((item) => ({
          variantId: item.id,
          quantity: item.quantity,
          unitPrice: String(item.price),
          notes: item.sku ? `SKU: ${item.sku}` : undefined,
        })),
      }),
    })
    return response.data
  }, [branch?.id, customerId, discountAmount, promotionCode, voucherCode, warehouse?.id])

  useEffect(() => {
    if (!cart.length) {
      setQuote(null)
      setQuoteError("")
      return
    }

    let active = true
    setQuoteLoading(true)
    setQuoteError("")
    const timer = window.setTimeout(() => {
      requestCheckoutQuote(cart)
        .then((nextQuote) => {
          if (active) setQuote(nextQuote)
        })
        .catch((caught) => {
          if (active) {
            setQuote(null)
            setQuoteError(caught instanceof Error ? caught.message : "Gagal menghitung kalkulasi checkout")
          }
        })
        .finally(() => {
          if (active) setQuoteLoading(false)
        })
    }, 250)
    return () => {
      active = false
      window.clearTimeout(timer)
    }
    // quoteSignature captures every value that changes the server-side quote.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteSignature, requestCheckoutQuote])

  const subtotal = quote ? Number(quote.subtotalAmount) : localSubtotal
  const totalDiscountAmount = quote ? Number(quote.discountAmount) : discountAmount
  const promotionDiscountAmount = quote ? Number(quote.promotionDiscountAmount) : 0
  const tax = quote ? Number(quote.taxAmount) : 0
  const total = quote ? Number(quote.totalAmount) : Math.max(0, localSubtotal - discountAmount)
  const cash = Number(cashAmount.replaceAll(/\D/g, "")) || 0

  // This QR opens the verified gateway checkout; merchant QR images are not used
  // because they cannot confirm payment through a provider webhook.
  useEffect(() => {
    if (paymentMethod !== "QRIS" || !pendingQrisOrder?.paymentUrl) {
      setDynamicStoreQrisUrl("")
      return
    }
    let active = true
    QRCode.toDataURL(pendingQrisOrder.paymentUrl, { width: 360, margin: 1 })
      .then((url) => { if (active) setDynamicStoreQrisUrl(url) })
      .catch(() => { if (active) setDynamicStoreQrisUrl("") })
    return () => { active = false }
  }, [paymentMethod, pendingQrisOrder?.paymentUrl])

  useEffect(() => {
    if (!branch?.id) return
    try {
      const raw = localStorage.getItem(pendingQrisStorageKey(branch.id))
      if (!raw) return
      const saved = JSON.parse(raw) as { orderId?: string; expiresAt?: string; amount?: number; paymentUrl?: string }
      if (!saved.orderId || !saved.expiresAt || !saved.amount) return
      setPendingQrisOrder({ orderId: saved.orderId, expiresAt: saved.expiresAt, amount: saved.amount, paymentUrl: saved.paymentUrl })
      setPaymentMethod("QRIS")
      setPaymentOpen(true)
    } catch {
      localStorage.removeItem(pendingQrisStorageKey(branch.id))
    }
  }, [branch?.id, setPaymentMethod, setPaymentOpen, setPendingQrisOrder])

  async function renewPendingQris(orderId = pendingQrisOrder?.orderId, amount = pendingQrisOrder?.amount) {
    if (!orderId || !amount || !branch?.id) return
    try {
      const response = await apiFetch<{ paymentUrl?: string }>("/api/v1/integrations/payments", {
        method: "POST",
        headers: { "idempotency-key": `midtrans-${orderId}` },
        body: JSON.stringify({ provider: "midtrans", orderId, customerName: "Pelanggan Kasir" }),
      })
      if (!response.data.paymentUrl) throw new Error("Tautan pembayaran Midtrans belum tersedia")
      const pending = { orderId, amount, paymentUrl: response.data.paymentUrl, expiresAt: pendingQrisOrder?.expiresAt ?? new Date(Date.now() + ONLINE_RESERVATION_MS).toISOString() }
      setPendingQrisOrder(pending)
      localStorage.setItem(pendingQrisStorageKey(branch.id), JSON.stringify(pending))
      setQrisPollingError("")
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Gagal memuat pembayaran Midtrans"
      setQrisPollingError(message)
      showError(message)
    }
  }

  useEffect(() => {
    if (!pendingQrisOrder) return
    let active = true
    const poll = async () => {
      try {
        const response = await apiFetch<CheckoutResult>(`/api/v1/sales/${pendingQrisOrder.orderId}`)
        if (!active) return
        if (response.data.order.status === "cancelled") {
          if (branch?.id) localStorage.removeItem(pendingQrisStorageKey(branch.id))
          setPendingQrisOrder(null)
          setPaymentOpen(false)
          showError(response.data.order.metadata?.paymentException === "refund_required"
            ? "Pembayaran diterima setelah stok dilepas. Dana perlu dikembalikan oleh pemilik."
            : "Waktu reservasi stok habis. Buat pesanan baru.")
          await refreshBootstrap()
          return
        }
        if (response.data.order.status !== "paid" || !response.data.receipt) return
        if (branch?.id) localStorage.removeItem(pendingQrisStorageKey(branch.id))
        setPendingQrisOrder(null)
        setQrisPollingError("")
        setPaymentOpen(false)
        setReceipt(response.data)
        playPosChimeSound()
        showSuccess("Pembayaran QRIS terverifikasi otomatis")
        await refreshBootstrap()
      } catch (caught) {
        if (active) setQrisPollingError(caught instanceof Error ? caught.message : "Status pembayaran belum dapat diperiksa")
      }
    }
    void poll()
    const interval = window.setInterval(() => void poll(), 2500)
    return () => {
      active = false
      window.clearInterval(interval)
    }
  }, [pendingQrisOrder, branch?.id, refreshBootstrap, setPaymentOpen, setPendingQrisOrder, setQrisPollingError, setReceipt])

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
  }, [setSplitPayments])

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
  }, [total, setSplitPayments])

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
    branch?.id, warehouse?.id, session?.id, customerId, selectedTableId, orderNote, discountAmount,
    promotionCode.trim().toUpperCase(), voucherCode.trim().toUpperCase(), paymentMethod, cash, splitPayments,
    cart.map((item) => [item.id, item.quantity, item.price]),
  ])

  useEffect(() => { setOrderKey(crypto.randomUUID()) }, [orderSignature, setOrderKey])

  async function submitOrder(status: "paid" | "held") {
    if (!branch?.id || !warehouse?.id) return showError("Cabang atau gudang belum dipilih")
    if (!session) return showError("Buka shift kasir sebelum transaksi")
    const validCartItems = cart.filter((item) => item.quantity > 0)
    if (!validCartItems.length) return showError("Keranjang tidak memiliki produk dengan jumlah > 0")

    let finalNote = orderNote
    if (selectedTableId) {
      const tbl = tables.find((t) => t.id === selectedTableId)
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
        clearCart()
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

    setSubmitting(true)
    try {
      let authoritativeQuote = quote
      if (typeof navigator === "undefined" || navigator.onLine) {
        authoritativeQuote = await requestCheckoutQuote(validCartItems)
        setQuote(authoritativeQuote)
      }
      if (!authoritativeQuote) {
        throw new Error("Koneksi diperlukan untuk memverifikasi pajak dan total transaksi")
      }
      const finalTotal = Number(authoritativeQuote.totalAmount)
      let paymentsPayload: { method: "cash" | "debit" | "credit" | "qris" | "e_wallet" | "transfer" | "pay_later" | "store_credit"; amount: string; provider?: string }[] = []

      if (paymentMethod === "QRIS") {
        const readiness = await apiFetch<{ midtransConfigured: boolean }>("/api/v1/integrations/payments")
        if (!readiness.data.midtransConfigured) throw new Error("Pembayaran QRIS menunggu aktivasi Midtrans")
      }

      if (paymentMethod === "Tunai") {
        if (cash < finalTotal) throw new Error("Nominal tunai belum cukup")
        paymentsPayload = [{ method: "cash", amount: String(cash) }]
      } else if (paymentMethod === "Split Bill") {
        if (splitPayments.some((item) => item.method === "qris")) {
          throw new Error("QRIS otomatis belum dapat digabungkan dengan split bill")
        }
        if (splitTotalPaid < finalTotal) {
          throw new Error(`Total alokasi split bill (${rupiah(splitTotalPaid)}) belum memenuhi total tagihan (${rupiah(finalTotal)})`)
        }
        paymentsPayload = splitPayments.map((item) => ({ method: item.method, amount: String(item.amount) }))
      } else {
        const selected = paymentMethods.find(([name]) => name === paymentMethod)!
        const method = selected[1] as "cash" | "debit" | "credit" | "qris" | "e_wallet" | "transfer" | "pay_later" | "store_credit"
        paymentsPayload = [{ method, amount: String(finalTotal), ...(method === "qris" ? { provider: "midtrans" } : {}) }]
      }

      const requestKey = `${orderKey}-${status}`
      const response = await apiFetch<CheckoutResult>("/api/v1/pos/checkout", {
        method: "POST",
        queueOffline: paymentMethod !== "QRIS",
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
          promotionCode: promotionCode.trim().toUpperCase() || undefined,
          voucherCode: voucherCode.trim().toUpperCase() || undefined,
          offlineReference: requestKey,
          items: validCartItems.map((item) => ({ variantId: item.id, quantity: String(item.quantity), unitPriceAmount: String(item.price), discountAmount: "0" })),
          payments: status === "paid" ? paymentsPayload : [],
        }),
      })
      if (response.queued) {
        showWarning("Transaksi disimpan offline, akan disinkronkan saat koneksi kembali")
        setPaymentOpen(false); resetCart(); return
      }
      if (paymentMethod === "QRIS") {
        const pending = { orderId: response.data.order.id, amount: finalTotal, expiresAt: response.data.reservationExpiresAt ?? new Date(Date.now() + ONLINE_RESERVATION_MS).toISOString() }
        setPendingQrisOrder(pending)
        localStorage.setItem(pendingQrisStorageKey(branch.id), JSON.stringify(pending))
        await renewPendingQris(pending.orderId, pending.amount)
        return
      }
      showSuccess("Pembayaran berhasil")
      playPosChimeSound()
      setReceipt(response.data)
      await refreshBootstrap()
    } catch (caught) { showError(caught instanceof Error ? caught.message : "Transaksi gagal") }
    finally { setSubmitting(false) }
  }

  function newOrder() {
    if (branch?.id) localStorage.removeItem(pendingQrisStorageKey(branch.id))
    setReceipt(undefined)
    setPendingQrisOrder(null)
    setPaymentOpen(false)
    resetCart()
    setCashAmount("")
    setQuote(null)
    setSplitPayments([])
    setPaymentMethod("Tunai")
  }

  const submitOrderRef = useRef(submitOrder)
  submitOrderRef.current = submitOrder

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = (document.activeElement?.tagName || "").toLowerCase()
      const isInputFocused = activeTag === "input" || activeTag === "textarea"

      if (e.key === "F1" || (!isInputFocused && e.key === "/")) {
        e.preventDefault()
        searchInputRef.current?.focus()
        searchInputRef.current?.select()
        return
      }

      if (e.key === "F4" && cart.length > 0 && !submitting) {
        e.preventDefault()
        void submitOrderRef.current("held")
        return
      }

      if (e.key === "F9" && cart.length > 0 && !paymentOpen) {
        e.preventDefault()
        setPaymentOpen(true)
        return
      }

      if (e.key === "Escape") {
        if (paymentOpen) setPaymentOpen(false)
        if (heldOpen) setHeldOpen(false)
        if (shiftOpen) setShiftOpen(false)
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [cart.length, submitting, paymentOpen, heldOpen, shiftOpen, setPaymentOpen])

  const shiftDialog = session ? <Dialog open={shiftOpen} onOpenChange={setShiftOpen}><DialogContent><DialogHeader><DialogTitle>Kelola shift kasir</DialogTitle><DialogDescription>{session.registerName} • dibuka {new Date(session.openedAt).toLocaleString("id-ID")}</DialogDescription></DialogHeader><div className="grid grid-cols-2 gap-2"><Button type="button" variant={shiftMode === "movement" ? "default" : "outline"} onClick={() => setShiftMode("movement")}>Mutasi kas</Button><Button type="button" variant={shiftMode === "close" ? "destructive" : "outline"} onClick={() => setShiftMode("close")}>Tutup shift</Button></div>{shiftMode === "movement" ? <form onSubmit={recordMovement} className="space-y-4"><div className="space-y-2"><Label>Jenis</Label><Select value={movement.direction} onValueChange={(value: "in" | "out") => setMovement((current) => ({ ...current, direction: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="in">Kas masuk</SelectItem><SelectItem value="out">Kas keluar</SelectItem></SelectContent></Select></div><div className="space-y-2"><Label htmlFor="movement-amount">Nominal</Label><Input id="movement-amount" type="number" min="1" step="1" value={movement.amount} onChange={(event) => setMovement((current) => ({ ...current, amount: event.target.value }))} required /></div><div className="space-y-2"><Label htmlFor="movement-category">Kategori</Label><Input id="movement-category" value={movement.category} onChange={(event) => setMovement((current) => ({ ...current, category: event.target.value }))} placeholder="Modal tambahan / petty cash" minLength={2} required /></div><div className="space-y-2"><Label htmlFor="movement-reason">Alasan</Label><Input id="movement-reason" value={movement.reason} onChange={(event) => setMovement((current) => ({ ...current, reason: event.target.value }))} minLength={3} required /></div><DialogFooter><Button type="submit" className="bg-emerald-600 hover:bg-emerald-700" disabled={submitting}>{submitting && <Loader2 className="animate-spin" />} Simpan mutasi</Button></DialogFooter></form> : <form onSubmit={closeShift} className="space-y-4"><p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">Hitung uang fisik di laci kasir. Sistem menghitung ekspektasi dan selisih otomatis.</p>{settlementPreview && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-900 dark:bg-emerald-950"><p className="text-sm text-muted-foreground">Kas seharusnya</p><p className="text-xl font-bold text-emerald-700 dark:text-emerald-300">{rupiah(Number(settlementPreview.expectedCash))}</p></div>}<div className="grid grid-cols-2 gap-3">{paymentMethods.map(([name, method]) => { const expected = settlementPreview?.breakdown?.[method]?.expected; return <div key={method} className="space-y-2"><Label htmlFor={`actual-${method}`}>{name} aktual{expected !== undefined && <span className="ml-1 text-xs font-normal text-muted-foreground">(seharusnya {rupiah(Number(expected))})</span>}</Label><Input id={`actual-${method}`} type="number" min="0" step="1" value={tenderActuals[method] ?? ""} onChange={(event) => setTenderActuals((current) => ({ ...current, [method]: event.target.value }))} required /></div> })}</div><div className="space-y-2"><Label htmlFor="settlement-notes">Catatan</Label><Textarea id="settlement-notes" value={settlementNotes} onChange={(event) => setSettlementNotes(event.target.value)} placeholder="Opsional: jelaskan jika ada selisih" /></div>{cart.length > 0 && <div className="flex items-center justify-between rounded-lg bg-rose-50 p-3 dark:bg-rose-950/40 text-xs text-rose-700 dark:text-rose-300 font-medium"><span>Keranjang masih berisi item ({cart.length} produk)</span><Button type="button" variant="destructive" size="sm" className="h-7 text-xs" onClick={clearCart}>Kosongkan Keranjang</Button></div>}<DialogFooter><Button type="submit" variant="destructive" disabled={submitting || cart.length > 0}>{submitting && <Loader2 className="animate-spin" />} Tutup dan rekonsiliasi</Button></DialogFooter></form>}</DialogContent></Dialog> : null

  if (!loading && catalogError && !products.length) {
    return <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center gap-3 p-6 text-center"><p className="font-semibold text-destructive" role="alert">Katalog POS gagal dimuat</p><p className="max-w-lg text-sm text-muted-foreground">{catalogError}</p><Button variant="outline" onClick={() => void refreshBootstrap(true)}>Coba lagi</Button></div>
  }

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
    const verification = receipt.receipt?.verificationToken || receipt.receipt?.verification_token
    const receiptTotal = Number(receipt.order.totalAmount || receipt.order.total_amount || total)
    const receiptChange = Number(receipt.order.changeAmount || receipt.order.change_amount || 0)
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-md shadow-xl">
          <CardContent className="p-7 text-center">
            <span className="mx-auto flex size-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              <ReceiptText className="size-8" />
            </span>
            <h2 className="mt-5 text-2xl font-bold">Pembayaran berhasil</h2>
            <p className="mt-1 text-sm text-muted-foreground">{number}</p>
            <div className="my-6 space-y-3 rounded-xl bg-muted/60 p-4 text-left">
              <div className="flex justify-between"><span>Total</span><strong>{rupiah(receiptTotal)}</strong></div>
              <div className="flex justify-between"><span>Metode</span><strong>{paymentMethod}</strong></div>
              {paymentMethod === "Split Bill" && splitPayments.length > 0 && (
                <div className="space-y-1 text-xs text-muted-foreground border-t border-dashed pt-2">
                  {splitPayments.map((sp, idx) => (
                    <div key={sp.id} className="flex justify-between">
                      <span>{sp.label || `Pembayaran #${idx + 1}`} ({sp.method.toUpperCase()})</span>
                      <span>{rupiah(sp.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
              {paymentMethod === "Tunai" && <div className="flex justify-between"><span>Kembalian</span><strong>{rupiah(receiptChange)}</strong></div>}
              {totalCashChange > 0 && paymentMethod === "Split Bill" && (
                <div className="flex justify-between text-emerald-600 font-semibold">
                  <span>Kembalian Tunai</span><strong>{rupiah(totalCashChange)}</strong>
                </div>
              )}
              <Separator />
              <p className="break-all text-xs text-muted-foreground">Kode verifikasi: {verification}</p>
            </div>
            <div className="flex flex-col gap-2 print:hidden">
              <Button
                className="w-full bg-emerald-600 hover:bg-emerald-700 font-bold gap-2 text-xs h-10"
                onClick={() => handleDirectThermalPrint(receipt)}
                disabled={printingThermal}
              >
                {printingThermal ? <Loader2 className="size-4 animate-spin" /> : <Printer className="size-4" />}
                🖨️ Cetak Direct Thermal (Bluetooth ESC/POS)
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" size="sm" onClick={() => window.print()} className="text-xs h-9">
                  <ReceiptText className="size-3.5 mr-1" /> Browser Print
                </Button>
                <Button variant="secondary" size="sm" onClick={newOrder} className="text-xs h-9 font-semibold">
                  Transaksi baru
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (paymentOpen) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] flex-col bg-muted/30 p-4 md:p-6">
        <div className="mx-auto w-full max-w-5xl">
          <Button variant="ghost" className="mb-4" onClick={() => setPaymentOpen(false)}>
            <ChevronLeft /> Kembali ke keranjang
          </Button>
          <div className="grid gap-5 lg:grid-cols-[1fr_0.8fr]">
            <Card>
              <CardContent className="p-6">
                <h2 className="text-xl font-bold">Pilih metode pembayaran</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {paymentMethod === "QRIS" ? "Stok akan berkurang setelah Midtrans mengonfirmasi pembayaran." : "Transaksi akan disimpan ke database dan stok langsung berkurang."}
                </p>
                <div className="mt-6 grid grid-cols-2 gap-3">
                  {paymentMethods.map(([name, , Icon]) => (
                    <Button
                      key={name}
                      variant={paymentMethod === name ? "default" : "outline"}
                      className={`h-24 flex-col gap-2 ${
                        paymentMethod === name ? "bg-emerald-600 hover:bg-emerald-700" : ""
                      }`}
                      onClick={() => selectPaymentMethod(name)}
                    >
                      <Icon className="size-6" />
                      {name}
                    </Button>
                  ))}
                </div>

                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="promotion-code">Kode promo</Label>
                    <Input
                      id="promotion-code"
                      value={promotionCode}
                      onChange={(event) => setPromotionCode(event.target.value.toUpperCase())}
                      placeholder="Contoh: HEMAT10"
                      autoComplete="off"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="voucher-code">Kode voucher</Label>
                    <Input
                      id="voucher-code"
                      value={voucherCode}
                      onChange={(event) => setVoucherCode(event.target.value.toUpperCase())}
                      placeholder="Contoh: VCR-2026"
                      autoComplete="off"
                    />
                  </div>
                </div>

                {/* Cash Tender Input */}
                {paymentMethod === "Tunai" && (
                  <div className="mt-6 space-y-3">
                    <Label>Uang diterima</Label>
                    <Input
                      value={cashAmount}
                      onChange={(event) => setCashAmount(event.target.value)}
                      placeholder="Rp 0"
                      className="h-14 text-xl font-semibold"
                    />
                    <div className="grid grid-cols-4 gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="col-span-4 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-300 font-semibold"
                        onClick={() => setCashAmount(String(total))}
                      >
                        Uang Pas ({rupiah(total)})
                      </Button>
                      {[10000, 20000, 50000, 100000].map((amount) => (
                        <Button
                          key={amount}
                          type="button"
                          variant="outline"
                          size="sm"
                          className="font-medium"
                          onClick={() => setCashAmount(String(amount))}
                        >
                          {amount / 1000}rb
                        </Button>
                      ))}
                    </div>
                  </div>
                )}

                {paymentMethod === "QRIS" && (
                  <div className="mt-6 rounded-2xl border bg-muted/30 p-5 text-center space-y-3">
                    <p className="font-semibold">Pembayaran QRIS melalui Midtrans</p>
                    {pendingQrisOrder?.paymentUrl ? (
                      <>
                        {dynamicStoreQrisUrl && <img src={dynamicStoreQrisUrl} alt="QR untuk membuka halaman pembayaran Midtrans" className="mx-auto size-48 rounded-xl bg-white p-2" />}
                        <p className="text-xs text-muted-foreground">Scan untuk membuka halaman pembayaran, lalu pilih QRIS. Pesanan akan selesai setelah konfirmasi dari Midtrans.</p>
                        <Button type="button" variant="outline" className="min-h-11" onClick={() => window.open(pendingQrisOrder.paymentUrl, "_blank", "noopener,noreferrer")}>Buka pembayaran Midtrans</Button>
                      </>
                    ) : pendingQrisOrder ? (
                      <Button type="button" variant="outline" className="min-h-11" onClick={() => void renewPendingQris()} disabled={submitting}>Muat ulang tautan pembayaran</Button>
                    ) : (
                      <p className="text-xs text-muted-foreground">Buat pesanan pending dan lanjutkan ke halaman pembayaran aman.</p>
                    )}
                    {qrisPollingError && <p className="text-xs text-amber-700" role="status">{qrisPollingError}</p>}
                  </div>
                )}

                {/* Split Bill UI */}
                {paymentMethod === "Split Bill" && (
                  <div className="mt-6 space-y-5 rounded-xl border bg-card p-4 sm:p-5 shadow-xs">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h3 className="font-semibold text-foreground">Mode Split Bill</h3>
                        <p className="text-xs text-muted-foreground">
                          Bagi pembayaran rata per orang atau alokasi nominal custom.
                        </p>
                      </div>
                      <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 text-xs font-medium">
                        <button
                          type="button"
                          className={`rounded-md px-3 py-1.5 transition ${
                            splitMode === "equal"
                              ? "bg-background shadow-xs font-semibold text-foreground"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                          onClick={() => {
                            setSplitMode("equal")
                            initEqualSplits(splitCount, total)
                          }}
                        >
                          Bagi Rata
                        </button>
                        <button
                          type="button"
                          className={`rounded-md px-3 py-1.5 transition ${
                            splitMode === "custom"
                              ? "bg-background shadow-xs font-semibold text-foreground"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                          onClick={() => setSplitMode("custom")}
                        >
                          Nominal Custom
                        </button>
                      </div>
                    </div>
                    {splitMode === "equal" && (
                      <div className="flex items-center justify-between rounded-lg bg-muted/50 p-3">
                        <span className="text-sm font-medium">Jumlah Orang / Bagian:</span>
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="size-8"
                            aria-label="Kurangi jumlah bagian split bill"
                            onClick={() => {
                              const next = Math.max(2, splitCount - 1)
                              setSplitCount(next)
                              initEqualSplits(next, total)
                            }}
                          >
                            <Minus className="size-3" aria-hidden="true" />
                          </Button>
                          <span className="w-8 text-center text-base font-bold">{splitCount}</span>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="size-8"
                            aria-label="Tambah jumlah bagian split bill"
                            onClick={() => {
                              const next = Math.min(20, splitCount + 1)
                              setSplitCount(next)
                              initEqualSplits(next, total)
                            }}
                          >
                            <Plus className="size-3" aria-hidden="true" />
                          </Button>
                        </div>
                      </div>
                    )}
                    <div className="space-y-3">
                      {splitPayments.map((item, index) => {
                        const itemCashChange =
                          item.method === "cash" && (item.cashTendered ?? 0) > item.amount
                            ? item.cashTendered! - item.amount
                            : 0
                        return (
                          <div key={item.id} className="rounded-lg border bg-background p-3 space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                {item.label || `Pembayaran #${index + 1}`}
                              </span>
                              {splitMode === "custom" && splitPayments.length > 1 && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="size-7 text-destructive"
                                  aria-label="Hapus pembayaran split"
                                  onClick={() => removeSplitPayment(item.id)}
                                >
                                  <Trash2 className="size-3.5" />
                                </Button>
                              )}
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div>
                                <Label className="text-xs">Metode Bayar</Label>
                                <Select
                                  value={item.method}
                                  onValueChange={(val: "cash" | "qris" | "debit") =>
                                    updateSplitPayment(item.id, { method: val })
                                  }
                                >
                                  <SelectTrigger className="h-10 text-xs">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="cash">Tunai (Cash)</SelectItem>
                                    <SelectItem value="qris">QRIS</SelectItem>
                                    <SelectItem value="debit">Kartu (Debit/Kredit)</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div>
                                <Label className="text-xs">Nominal Tagihan (Rp)</Label>
                                <Input
                                  type="number"
                                  min="0"
                                  className="h-10 text-sm font-semibold"
                                  value={item.amount || ""}
                                  disabled={splitMode === "equal"}
                                  onChange={(e) =>
                                    updateSplitPayment(item.id, { amount: Number(e.target.value) || 0 })
                                  }
                                />
                              </div>
                            </div>
                            {item.method === "cash" && (
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-dashed">
                                <div>
                                  <Label className="text-xs text-muted-foreground">Uang Diterima (Opsional)</Label>
                                  <Input
                                    type="number"
                                    placeholder={`Rp ${item.amount.toLocaleString("id-ID")}`}
                                    className="h-9 text-xs"
                                    value={item.cashTendered || ""}
                                    onChange={(e) =>
                                      updateSplitPayment(item.id, {
                                        cashTendered: Number(e.target.value) || 0,
                                      })
                                    }
                                  />
                                </div>
                                {itemCashChange > 0 && (
                                  <div className="flex flex-col justify-center rounded bg-emerald-50 px-3 py-1 text-xs text-emerald-700 font-medium">
                                    <span>Kembalian Slot Ini:</span>
                                    <strong className="text-sm">{rupiah(itemCashChange)}</strong>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                    {splitMode === "custom" && (
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full border-dashed"
                        onClick={addCustomSplitPayment}
                      >
                        <Plus className="mr-2 size-4" /> Tambah Pembayaran Split
                      </Button>
                    )}
                    <div
                      className={`rounded-xl p-4 border ${
                        splitTotalPaid >= total
                          ? "bg-emerald-50/70 border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-900"
                          : "bg-amber-50/70 border-amber-200 dark:bg-amber-950/40 dark:border-amber-900"
                      }`}
                    >
                      <div className="flex justify-between text-xs font-medium text-muted-foreground mb-1">
                        <span>Total Tagihan Order</span>
                        <span>{rupiah(total)}</span>
                      </div>
                      <div className="flex justify-between text-sm font-semibold mb-1">
                        <span>Total Teralokasi Split</span>
                        <span>{rupiah(splitTotalPaid)}</span>
                      </div>
                      <Separator className="my-2" />
                      {splitRemaining > 0 ? (
                        <div className="flex justify-between text-sm font-bold text-amber-700 dark:text-amber-400">
                          <span>Sisa Belum Terbayar</span>
                          <span>{rupiah(splitRemaining)}</span>
                        </div>
                      ) : (
                        <div className="flex justify-between text-sm font-bold text-emerald-700 dark:text-emerald-400">
                          <span>Status Pembayaran</span>
                          <span>
                            LUNAS ✓{" "}
                            {totalCashChange > 0 ? `(Kembalian ${rupiah(totalCashChange)})` : ""}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="h-fit">
              <CardContent className="p-6">
                <h3 className="font-semibold">Ringkasan pembayaran</h3>
                <div className="mt-5 space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span>{rupiah(subtotal)}</span>
                  </div>
                  {totalDiscountAmount > 0 && (
                    <div className="flex justify-between text-rose-600">
                      <span>Diskon</span>
                      <span>-{rupiah(totalDiscountAmount)}</span>
                    </div>
                  )}
                  {promotionDiscountAmount > 0 && (
                    <p className="text-right text-xs text-emerald-700">Promo/voucher diterapkan: {rupiah(promotionDiscountAmount)}</p>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Pajak</span>
                    <span>{rupiah(tax)}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between text-xl font-bold">
                    <span>Total</span>
                    <span className="text-emerald-600">{rupiah(total)}</span>
                  </div>
                  {quoteLoading && <p className="text-xs text-muted-foreground" role="status">Menghitung pajak dan promo…</p>}
                  {quoteError && <p className="text-xs font-medium text-destructive" role="alert">{quoteError}</p>}
                  {paymentMethod === "Tunai" && cash >= total && (
                    <div className="flex justify-between rounded-lg bg-emerald-50 p-3 font-medium text-emerald-700">
                      <span>Kembalian</span>
                      <span>{rupiah(cash - total)}</span>
                    </div>
                  )}
                  {paymentMethod === "Split Bill" && splitTotalPaid >= total && (
                    <div className="flex justify-between rounded-lg bg-emerald-50 p-3 font-medium text-emerald-700">
                      <span>Split Status</span>
                      <span>LUNAS</span>
                    </div>
                  )}
                </div>
                <Button
                  className="mt-6 h-14 w-full bg-emerald-600 text-base hover:bg-emerald-700"
                  onClick={() => void submitOrder("paid")}
                  disabled={submitting || quoteLoading || !quote || Boolean(pendingQrisOrder) || (paymentMethod === "Split Bill" && splitTotalPaid < total)}
                >
                  {submitting ? <Loader2 className="animate-spin" /> : pendingQrisOrder ? <Loader2 className="animate-spin" /> : <ReceiptText />} {pendingQrisOrder ? "Menunggu Verifikasi QRIS" : paymentMethod === "QRIS" ? `Aktifkan QRIS • ${rupiah(total)}` : `Bayar ${rupiah(total)}`}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    )
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
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-9 text-destructive"
                        aria-label={`Hapus pesanan ditahan dari ${new Date(held.createdAt).toLocaleString("id-ID")}`}
                        onClick={() => void discardHeld(held.id)}
                      >
                        <Trash2 className="size-3.5" aria-hidden="true" />
                      </Button>
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

  const cartItemCount = cart.reduce((sum, item) => sum + item.quantity, 0)
  const renderCartPanel = (idPrefix: string, className?: string) => (
    <PosCartPanel
      idPrefix={idPrefix}
      className={className}
      cart={cart}
      branchName={branch?.name}
      warehouseName={warehouse?.name}
      customers={customers}
      tables={tables}
      customerId={customerId}
      selectedTableId={selectedTableId}
      orderNote={orderNote}
      discount={discount}
      subtotal={subtotal}
      discountAmount={discountAmount}
      tax={tax}
      total={total}
      submitting={submitting}
      onCustomerChange={setCustomerId}
      onTableChange={setSelectedTableId}
      onOrderNoteChange={setOrderNote}
      onDiscountChange={setDiscount}
      onClear={clearCart}
      onRemove={removeCartItem}
      onChangeQuantity={changeQuantity}
      onSetQuantity={setQuantity}
      onHold={() => void submitOrder("held")}
      onCheckout={() => {
        setMobileCartOpen(false)
        setPaymentOpen(true)
      }}
    />
  )

  return (
    <div className="grid min-h-[calc(100vh-4rem)] grid-cols-1 bg-muted/30 xl:grid-cols-[1fr_430px]">
      {shiftDialog}
      {heldDialog}
      <section className="min-w-0 p-4 pb-28 md:p-5 md:pb-28 xl:pb-5">
        <div className="mb-4 flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-2xs sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="flex items-center gap-2 font-semibold text-foreground text-sm">
              <span className="size-2 rounded-full bg-emerald-500 shrink-0" />
              {session.registerName ? `${session.registerName} • ` : ""}Shift aktif
              {offlineCount > 0 ? (
                <Badge variant="outline" className="border-amber-400 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 text-[10px] px-1.5 py-0 font-normal">
                  ⚡ {offlineCount} Antrean
                </Badge>
              ) : null}
              {!isOnline ? (
                <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                  <WifiOff className="size-3 mr-1" /> Offline
                </Badge>
              ) : null}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {branches.find((cabang) => cabang.id === session.branchId)?.name ? `${branches.find((cabang) => cabang.id === session.branchId)?.name} • ` : ""}
              Kas awal {rupiah(Number(session.openingAmount))} • {new Date(session.openedAt).toLocaleString("id-ID")}
              {session.shiftHours ? ` • Jaga ${session.shiftHours} jam` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2 shrink-0 sm:ml-auto">
            {offlineCount > 0 && (
              <Button size="sm" variant="outline" className="border-amber-400 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 text-xs min-h-11" onClick={() => void syncNow()} disabled={syncingOffline}>
                <RefreshCw className={`size-3.5 mr-1 ${syncingOffline ? "animate-spin" : ""}`} /> Sinkron ({offlineCount})
              </Button>
            )}
            <Select value={String(printerWidth)} onValueChange={(value) => setPrinterWidth(value === "80" ? 80 : 58)}>
              <SelectTrigger className="min-h-11 w-[92px] text-xs" aria-label="Ukuran kertas printer">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="58">58 mm</SelectItem>
                <SelectItem value="80">80 mm</SelectItem>
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant={printerName ? "outline" : "secondary"}
              className="text-xs min-h-11 gap-1.5 shadow-2xs"
              aria-label={printerName ? `Printer Bluetooth terhubung: ${printerName}. Tekan untuk mengganti printer.` : "Hubungkan printer Bluetooth"}
              onClick={handleConnectPrinter}
            >
              <Bluetooth className={`size-3.5 ${printerName ? "text-emerald-600" : "text-muted-foreground"}`} aria-hidden="true" />
              {printerName ? printerName.slice(0, 14) : "Printer BLE"}
            </Button>
            <Button size="sm" variant="outline" className="relative shadow-2xs text-xs min-h-11" onClick={() => { void loadHeldOrders(); setHeldOpen(true) }}>
              <Clock className="size-3.5 mr-1" /> Ditahan {heldList.length > 0 && <Badge variant="secondary" className="ml-1 bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">{heldList.length}</Badge>}
            </Button>
            <Button size="sm" variant="outline" className="shadow-2xs text-xs min-h-11" onClick={() => showShift("movement")}>
              <Banknote className="size-3.5 mr-1" /> Mutasi
            </Button>
            <Button size="sm" variant="destructive" className="shadow-2xs text-xs min-h-11" onClick={() => showShift("close")}>
              Tutup shift
            </Button>
          </div>
        </div>
        <div className="mb-4 flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchInputRef}
              className="h-12 bg-background pl-10 text-sm font-medium shadow-xs"
              placeholder="Cari produk, SKU, atau barcode... (Ketik nama/scan barcode) [F1]"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && search.trim()) {
                  const matched = barcodeMap.get(search.trim().toLowerCase())
                  if (matched) {
                    if (matched.trackStock && matched.stock <= 0) {
                      showError(`Stok produk ${matched.name} telah habis`)
                    } else {
                      add(matched)
                      setSearch("")
                      showSuccess(`Ditambahkan: ${matched.name}`)
                    }
                  }
                }
              }}
              autoFocus
            />
          </div>
          <Button
            variant="outline"
            size="icon"
            className="size-12 bg-background shadow-xs"
            aria-label="Fokus ke pencarian atau pemindai barcode"
            onClick={() => {
              searchInputRef.current?.focus()
              showInfo("Scan atau ketik barcode produk")
            }}
          >
            <Barcode className="size-5" aria-hidden="true" />
          </Button>
        </div>
        <ScrollArea className="mb-4 w-full whitespace-nowrap">
          <div className="flex gap-2 pb-2">
            {categories.map((item) => (
              <Button
                key={item}
                size="sm"
                variant={category === item ? "default" : "outline"}
                className={category === item ? "bg-emerald-600 hover:bg-emerald-700 shadow-xs" : "bg-background shadow-2xs"}
                onClick={() => setCategory(item)}
              >
                {item}
              </Button>
            ))}
          </div>
        </ScrollArea>
        {loading && !products.length && (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="size-7 animate-spin text-emerald-600" />
          </div>
        )}
        {!loading && !filtered.length && (
          <div className="flex h-64 flex-col items-center justify-center text-center">
            <ShoppingCart className="size-10 text-muted-foreground/30" />
            <p className="mt-3 font-medium">Produk tidak ditemukan</p>
            <p className="text-sm text-muted-foreground">Tambahkan produk dan stok dari menu Produk.</p>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
          {visibleProducts.map((product) => {
            const isOut = product.trackStock && product.stock <= 0
            const isLow = product.trackStock && product.stock > 0 && product.stock <= 5
            return (
              <button
                key={product.id}
                disabled={isOut}
                className="group overflow-hidden rounded-xl border bg-card text-left shadow-xs transition-all duration-200 hover:-translate-y-1 hover:border-emerald-400 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => add(product)}
              >
                {product.imageUrl ? (
                  <div className="aspect-[1.5] w-full overflow-hidden bg-muted">
                    <img
                      src={product.thumbnailUrl || product.imageUrl}
                      alt={product.name}
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                    />
                  </div>
                ) : (
                  <div className={`flex aspect-[1.5] items-center justify-center text-4xl transition-transform duration-200 group-hover:scale-105 ${getCategoryColor(product.category, product.name)}`}>
                    {getCategoryEmoji(product.category, product.name)}
                  </div>
                )}
                <div className="p-3">
                  <p className="truncate text-sm font-semibold text-foreground">{product.name}</p>
                  <p className="mt-1 text-sm font-bold text-emerald-600 dark:text-emerald-400">{rupiah(product.price)}</p>
                  <div className="mt-2 flex items-center justify-between">
                    {isOut ? (
                      <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Stok Habis</Badge>
                    ) : isLow ? (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">Stok {product.stock}</Badge>
                    ) : (
                      <p className="truncate text-xs text-muted-foreground">{product.sku} • Stok {product.trackStock ? product.stock : "∞"}</p>
                    )}
                  </div>
                </div>
              </button>
            )
          })}
          {filtered.length > visibleLimit && (
            <div className="col-span-full mt-4 flex justify-center py-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setVisibleLimit((curr) => curr + 48)}
                className="text-xs font-semibold shadow-xs"
              >
                Tampilkan {Math.min(48, filtered.length - visibleLimit)} produk lagi ({filtered.length - visibleLimit} tersisa)
              </Button>
            </div>
          )}
        </div>
      </section>
      <aside className="hidden border-l xl:flex xl:h-[calc(100vh-4rem)]">
        {renderCartPanel("desktop", "h-full w-full")}
      </aside>

      <Drawer open={mobileCartOpen} onOpenChange={setMobileCartOpen}>
        <DrawerTrigger asChild>
          <Button
            className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 h-16 justify-between rounded-2xl bg-emerald-600 px-5 text-white shadow-xl shadow-emerald-950/25 hover:bg-emerald-700 xl:hidden"
            aria-label={`Buka keranjang, ${cartItemCount} item, total ${rupiah(total)}`}
          >
            <span className="flex items-center gap-3">
              <span className="relative flex size-10 items-center justify-center rounded-xl bg-white/15">
                <ShoppingCart className="size-5" aria-hidden="true" />
                {cartItemCount > 0 && (
                  <span className="absolute -right-1.5 -top-1.5 flex min-w-5 items-center justify-center rounded-full bg-white px-1 text-[11px] font-bold text-emerald-700">
                    {cartItemCount}
                  </span>
                )}
              </span>
              <span className="text-left">
                <span className="block text-sm font-bold">Lihat keranjang</span>
                <span className="block text-xs text-emerald-50">{cart.length ? `${cart.length} produk` : "Belum ada produk"}</span>
              </span>
            </span>
            <span className="text-base font-extrabold">{rupiah(total)}</span>
          </Button>
        </DrawerTrigger>
        <DrawerContent className="h-[88dvh] max-h-[88dvh] xl:hidden">
          <DrawerHeader className="sr-only">
            <DrawerTitle>Keranjang transaksi</DrawerTitle>
            <DrawerDescription>Atur item, pelanggan, meja, diskon, dan lanjutkan pembayaran.</DrawerDescription>
          </DrawerHeader>
          {renderCartPanel("mobile", "flex-1")}
        </DrawerContent>
      </Drawer>
    </div>
  )
}
