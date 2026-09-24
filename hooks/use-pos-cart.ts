"use client"

import { useState } from "react"
import type { PosProduct } from "@/hooks/use-pos-bootstrap"
import { showError } from "@/lib/toast-handler"

export type PosCartItem = PosProduct & { quantity: number }

export function usePosCart() {
  const [cart, setCart] = useState<PosCartItem[]>([])
  const [customerId, setCustomerId] = useState<string>()
  const [selectedTableId, setSelectedTableId] = useState("takeaway")
  const [orderNote, setOrderNote] = useState("")
  const [discount, setDiscount] = useState("0")
  const [promotionCode, setPromotionCode] = useState("")
  const [voucherCode, setVoucherCode] = useState("")

  function add(product: PosProduct) {
    if (product.trackStock && product.stock <= 0) {
      showError("Stok produk habis")
      return
    }

    setCart((current) => {
      const existing = current.find((item) => item.id === product.id)
      if (!existing) return [...current, { ...product, quantity: 1 }]
      if (product.trackStock && existing.quantity >= product.stock) {
        showError("Jumlah melebihi stok tersedia")
        return current
      }
      return current.map((item) => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item)
    })
  }

  function changeQuantity(id: string, changeBy: number) {
    setCart((current) => current.map((item) => {
      if (item.id !== id) return item
      const next = Math.max(0, item.quantity + changeBy)
      if (item.trackStock && next > item.stock) {
        showError("Jumlah melebihi stok tersedia")
        return item
      }
      return { ...item, quantity: next }
    }))
  }

  function setQuantity(id: string, quantity: number) {
    const validQuantity = Math.max(0, quantity)
    setCart((current) => current.map((item) => {
      if (item.id !== id) return item
      if (item.trackStock && validQuantity > item.stock) {
        showError("Jumlah melebihi stok tersedia")
        return { ...item, quantity: item.stock }
      }
      return { ...item, quantity: validQuantity }
    }))
  }

  function remove(id: string) {
    setCart((current) => current.filter((item) => item.id !== id))
  }

  function clear() {
    setCart([])
  }

  function reset() {
    setCart([])
    setCustomerId(undefined)
    setSelectedTableId("takeaway")
    setOrderNote("")
    setDiscount("0")
    setPromotionCode("")
    setVoucherCode("")
  }

  return {
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
    remove,
    clear,
    reset,
  }
}
