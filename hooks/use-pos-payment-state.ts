"use client"

import { useState } from "react"

export type CheckoutResult = {
  order: {
    id: string
    status?: string
    orderNumber?: string
    order_number?: string
    totalAmount?: string
    total_amount?: string
    changeAmount?: string
    change_amount?: string
  }
  receipt: { verificationToken?: string; verification_token?: string } | null
  pointsEarned?: string
}

export type CheckoutQuote = {
  subtotalAmount: string
  itemDiscountAmount: string
  orderDiscountAmount: string
  promotionDiscountAmount: string
  discountAmount: string
  taxAmount: string
  exclusiveTaxAmount: string
  serviceChargeAmount: string
  totalAmount: string
}

export type SplitPaymentItem = {
  id: string
  method: "cash" | "qris" | "debit"
  amount: number
  cashTendered?: number
  label: string
}

export function usePosPaymentState() {
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState("Tunai")
  const [cashAmount, setCashAmount] = useState("")
  const [quote, setQuote] = useState<CheckoutQuote | null>(null)
  const [quoteLoading, setQuoteLoading] = useState(false)
  const [quoteError, setQuoteError] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [receipt, setReceipt] = useState<CheckoutResult>()
  const [pendingQrisOrder, setPendingQrisOrder] = useState<{ orderId: string; expiresAt: string; amount: number; paymentUrl?: string } | null>(null)
  const [qrisSecondsLeft, setQrisSecondsLeft] = useState(0)
  const [qrisPollingError, setQrisPollingError] = useState("")
  const [splitMode, setSplitMode] = useState<"equal" | "custom">("equal")
  const [splitCount, setSplitCount] = useState(2)
  const [splitPayments, setSplitPayments] = useState<SplitPaymentItem[]>([])
  const [orderKey, setOrderKey] = useState(() => crypto.randomUUID())

  return {
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
    qrisSecondsLeft,
    setQrisSecondsLeft,
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
  }
}
