"use client"

import { Minus, PauseCircle, Plus, ShoppingCart, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import type { PosCartItem } from "@/hooks/use-pos-cart"
import type { PosCustomer, PosTable } from "@/hooks/use-pos-bootstrap"
import { cn } from "@/lib/utils"

type PosCartPanelProps = {
  className?: string
  idPrefix: string
  cart: PosCartItem[]
  branchName?: string
  warehouseName?: string
  customers: PosCustomer[]
  tables: PosTable[]
  customerId?: string
  selectedTableId: string
  orderNote: string
  discount: string
  subtotal: number
  discountAmount: number
  tax: number
  total: number
  submitting: boolean
  onCustomerChange: (value: string) => void
  onTableChange: (value: string) => void
  onOrderNoteChange: (value: string) => void
  onDiscountChange: (value: string) => void
  onClear: () => void
  onRemove: (id: string) => void
  onChangeQuantity: (id: string, changeBy: number) => void
  onSetQuantity: (id: string, quantity: number) => void
  onHold: () => void
  onCheckout: () => void
}

const rupiah = (amount: number) => `Rp ${amount.toLocaleString("id-ID")}`

export function PosCartPanel({
  className,
  idPrefix,
  cart,
  branchName,
  warehouseName,
  customers,
  tables,
  customerId,
  selectedTableId,
  orderNote,
  discount,
  subtotal,
  discountAmount,
  tax,
  total,
  submitting,
  onCustomerChange,
  onTableChange,
  onOrderNoteChange,
  onDiscountChange,
  onClear,
  onRemove,
  onChangeQuantity,
  onSetQuantity,
  onHold,
  onCheckout,
}: PosCartPanelProps) {
  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0)

  return (
    <div className={cn("flex min-h-0 flex-col bg-background", className)}>
      <div className="flex items-center justify-between border-b p-4 pr-12 xl:pr-4">
        <div>
          <h2 className="flex items-center gap-2 font-bold">
            <ShoppingCart className="size-5 text-emerald-600" aria-hidden="true" />
            Keranjang
            <Badge className="bg-emerald-600" aria-label={`${itemCount} item di keranjang`}>{itemCount}</Badge>
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{branchName} • {warehouseName}</p>
        </div>
        {cart.length > 0 && (
          <Button variant="ghost" size="sm" className="h-9 text-xs text-muted-foreground hover:text-destructive" onClick={onClear}>
            <Trash2 className="mr-1 size-3.5" aria-hidden="true" /> Kosongkan
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 border-b p-3">
        <Select value={customerId} onValueChange={onCustomerChange}>
          <SelectTrigger className="h-10 text-xs" aria-label="Pilih pelanggan">
            <SelectValue placeholder="Pilih pelanggan" />
          </SelectTrigger>
          <SelectContent>
            {customers.map((item) => (
              <SelectItem key={item.id} value={item.id}>{item.name} • {item.code}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={selectedTableId} onValueChange={onTableChange}>
          <SelectTrigger className="h-10 text-xs" aria-label="Pilih meja atau takeaway">
            <SelectValue placeholder="Pilih meja" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="takeaway">Tanpa Meja (Takeaway)</SelectItem>
            {tables.map((table) => (
              <SelectItem key={table.id} value={table.id}>{table.name} (Cap {table.capacity})</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-2 p-3">
          {!cart.length && (
            <div className="py-16 text-center">
              <ShoppingCart className="mx-auto size-12 text-muted-foreground/30" aria-hidden="true" />
              <p className="mt-4 font-medium">Keranjang kosong</p>
              <p className="mt-1 text-xs text-muted-foreground">Cari produk atau scan barcode untuk memulai</p>
            </div>
          )}
          {cart.map((item) => (
            <div key={item.id} className="rounded-xl border bg-card p-3 shadow-2xs">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{item.name}</p>
                  <p className="text-xs text-muted-foreground">{rupiah(item.price)} • {item.sku}</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-11 text-destructive sm:size-9"
                  aria-label={`Hapus ${item.name} dari keranjang`}
                  onClick={() => onRemove(item.id)}
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </Button>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <div className="flex items-center rounded-lg border bg-background">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-11 sm:size-9"
                    aria-label={`Kurangi jumlah ${item.name}`}
                    onClick={() => onChangeQuantity(item.id, -1)}
                  >
                    <Minus className="size-3" aria-hidden="true" />
                  </Button>
                  <Input
                    id={`${idPrefix}-quantity-${item.id}`}
                    type="number"
                    min="0"
                    inputMode="numeric"
                    aria-label={`Jumlah ${item.name}`}
                    className="h-9 w-12 border-0 bg-transparent p-0 text-center text-sm font-semibold focus-visible:ring-0 focus-visible:ring-offset-0 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    value={item.quantity === 0 ? "" : item.quantity}
                    onChange={(event) => {
                      const value = event.target.value === "" ? 0 : Number.parseInt(event.target.value, 10)
                      onSetQuantity(item.id, Number.isNaN(value) ? 0 : value)
                    }}
                    onFocus={(event) => event.target.select()}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-11 sm:size-9"
                    aria-label={`Tambah jumlah ${item.name}`}
                    onClick={() => onChangeQuantity(item.id, 1)}
                  >
                    <Plus className="size-3" aria-hidden="true" />
                  </Button>
                </div>
                <p className="font-bold text-foreground">{rupiah(item.price * item.quantity)}</p>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>

      <div className="border-t bg-background p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="mb-3 grid grid-cols-2 gap-2">
          <div>
            <Label htmlFor={`${idPrefix}-order-note`} className="sr-only">Catatan pesanan</Label>
            <Textarea
              id={`${idPrefix}-order-note`}
              placeholder="Catatan pesanan"
              className="min-h-16 resize-none text-xs"
              value={orderNote}
              onChange={(event) => onOrderNoteChange(event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor={`${idPrefix}-discount`} className="text-xs">Diskon order</Label>
            <Input
              id={`${idPrefix}-discount`}
              type="number"
              min="0"
              inputMode="numeric"
              className="h-10 text-xs"
              value={discount}
              onChange={(event) => onDiscountChange(event.target.value)}
            />
          </div>
        </div>
        <div className="space-y-2 text-sm" aria-live="polite">
          <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{rupiah(subtotal)}</span></div>
          {discountAmount > 0 && <div className="flex justify-between text-rose-600"><span>Diskon</span><span>-{rupiah(discountAmount)}</span></div>}
          <div className="flex justify-between"><span className="text-muted-foreground">Pajak</span><span>{rupiah(tax)}</span></div>
          <Separator />
          <div className="flex justify-between text-lg font-bold"><span>Total</span><span className="text-emerald-600 dark:text-emerald-400">{rupiah(total)}</span></div>
        </div>
        <div className="mt-4 grid grid-cols-[auto_1fr] gap-2">
          <Button
            variant="outline"
            size="icon"
            className="size-12 shadow-2xs"
            aria-label="Tahan pesanan (F4)"
            title="Tahan Pesanan (F4)"
            onClick={onHold}
            disabled={!cart.length || submitting}
          >
            <PauseCircle className="size-5" aria-hidden="true" />
          </Button>
          <Button
            disabled={!cart.length || submitting}
            className="h-12 bg-emerald-600 text-base font-bold shadow-md shadow-emerald-600/20 hover:bg-emerald-700"
            aria-label={`Bayar ${rupiah(total)} (F9)`}
            title="Bayar (F9)"
            onClick={onCheckout}
          >
            Bayar • {rupiah(total)} [F9]
          </Button>
        </div>
      </div>
    </div>
  )
}
