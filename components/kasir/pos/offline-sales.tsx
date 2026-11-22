"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { offlineCheckoutBody, retryOfflineCheckout, type OfflineMutation } from "@/lib/offline/queue"

export function OfflineSales({ sales, online, cashSessionId, onRetry }: {
  sales: OfflineMutation[]
  online: boolean
  cashSessionId?: string
  onRetry: () => Promise<unknown>
}) {
  const [busy, setBusy] = useState<string>()
  const [feedback, setFeedback] = useState("")

  async function retry(sale: OfflineMutation, expectedTotalAmount?: string) {
    setBusy(sale.id)
    setFeedback("")
    try {
      await retryOfflineCheckout(sale.id, cashSessionId && expectedTotalAmount ? { cashSessionId, expectedTotalAmount } : undefined)
      setFeedback("Penjualan sudah tercatat di server.")
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Gagal mencatat penjualan.")
    } finally {
      await onRetry()
      setBusy(undefined)
    }
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="min-h-11">
          Antrean penjualan ({sales.length})
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Antrean penjualan offline</DialogTitle>
          <DialogDescription>
            Coba sinkronkan kembali. Jika shift asal sudah ditutup, catat penjualan yang sama pada shift aktif.
          </DialogDescription>
        </DialogHeader>
        <p role="status" className="text-sm">{feedback}</p>
        {sales.length === 0 && <p className="text-sm text-muted-foreground">Antrean penjualan kosong.</p>}
        <ul className="space-y-3">
          {sales.map((sale) => {
            const body = offlineCheckoutBody(sale)
            const total = typeof body?.expectedTotalAmount === "string" && /^[0-9]+$/.test(body.expectedTotalAmount)
              ? body.expectedTotalAmount
              : undefined
            return (
              <li key={sale.id} className="space-y-2 rounded-lg border p-3 text-sm">
                <p className="font-medium">{sale.failedPermanently ? "Perlu ditinjau" : "Menunggu sinkronisasi"}</p>
                <p className="text-muted-foreground">
                  {new Date(sale.createdAt).toLocaleString("id-ID")}
                  {total && ` · Rp ${BigInt(total).toLocaleString("id-ID")}`}
                </p>
                <p className="break-all text-xs text-muted-foreground">{sale.idempotencyKey}</p>
                {sale.lastError && <p className="text-destructive">{sale.lastError}</p>}
                <Button type="button" size="sm" variant="outline" disabled={!online || Boolean(busy)} onClick={() => void retry(sale)}>
                  Coba sinkronkan
                </Button>
                {sale.lastError && cashSessionId && cashSessionId !== body?.cashSessionId && (
                  <form className="space-y-2" onSubmit={(event) => {
                    event.preventDefault()
                    const amount = total ?? String(new FormData(event.currentTarget).get("originalTotal") ?? "")
                    void retry(sale, amount)
                  }}>
                    {!total && (
                      <div className="space-y-1">
                        <Label htmlFor={`offline-total-${sale.id}`}>Total penjualan asal (Rp)</Label>
                        <Input id={`offline-total-${sale.id}`} name="originalTotal" inputMode="numeric" pattern="[0-9]+" required />
                      </div>
                    )}
                    <Button type="submit" size="sm" disabled={!online || Boolean(busy)}>Catat pada shift aktif</Button>
                  </form>
                )}
              </li>
            )
          })}
        </ul>
      </DialogContent>
    </Dialog>
  )
}
