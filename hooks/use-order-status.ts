"use client";

import { useEffect, useState } from "react";
import { selfOrderFetch, SelfOrderApiError } from "@/lib/client/self-order-api";

export type OrderStatus = {
  order: {
    id: string;
    orderNumber: string;
    status: string;
    totalAmount: string;
    occurredAt: string;
    completedAt: string | null;
  };
  kitchenTicket: {
    status: string;
    startedAt: string | null;
    readyAt: string | null;
    servedAt: string | null;
  } | null;
  payments: Array<{ method: string; status: string; amount: string }>;
  items: Array<{ id: string; name: string; quantity: string; totalAmount: string; notes: string | null }>;
};

export function useOrderStatus(orderId: string | null, token: string, intervalMs = 3_000) {
  const [status, setStatus] = useState<OrderStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!orderId) return;
    let cancelled = false;

    async function refresh() {
      if (cancelled || (typeof document !== "undefined" && document.hidden)) return;
      setLoading(true);
      try {
        const res = await selfOrderFetch<OrderStatus>(`/api/v1/self-order/orders/${orderId}?token=${encodeURIComponent(token)}`);
        if (!cancelled) {
          setStatus(res.data);
          setError("");
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof SelfOrderApiError ? e.message : "Gagal mengambil status");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void refresh();
    const id = setInterval(refresh, intervalMs);
    const handleVisibility = () => {
      if (typeof document !== "undefined" && !document.hidden) void refresh();
    };
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibility);
    }
    return () => {
      cancelled = true;
      clearInterval(id);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVisibility);
      }
    };
  }, [orderId, token, intervalMs]);

  return { status, loading, error, setStatus };
}
