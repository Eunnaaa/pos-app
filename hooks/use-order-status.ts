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

export function useOrderStatus(orderId: string | null, token: string, intervalMs = 5_000) {
  const [status, setStatus] = useState<OrderStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!orderId) return;
    let cancelled = false;
    let timerId: NodeJS.Timeout | null = null;

    async function poll() {
      if (cancelled) return;
      if (typeof document !== "undefined" && document.hidden) {
        // Postpone next poll if tab is hidden
        timerId = setTimeout(poll, intervalMs);
        return;
      }

      try {
        const res = await selfOrderFetch<OrderStatus>(
          `/api/v1/self-order/orders/${orderId}?token=${encodeURIComponent(token)}`
        );
        if (!cancelled && res.data) {
          setStatus(res.data);
          setError("");

          // Stop polling if order has reached final terminal state
          const isDone =
            ["completed", "cancelled", "refunded"].includes(res.data.order.status) ||
            res.data.kitchenTicket?.status === "served";

          if (isDone) {
            return; // Terminate polling
          }

          // Dynamic interval: 4s when pending, 8s when cooking
          const nextInterval = res.data.order.status === "pending" ? 4_000 : 8_000;
          timerId = setTimeout(poll, nextInterval);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof SelfOrderApiError ? e.message : "Gagal mengambil status");
          timerId = setTimeout(poll, intervalMs * 2);
        }
      }
    }

    // Initial load with loading state
    setLoading(true);
    selfOrderFetch<OrderStatus>(`/api/v1/self-order/orders/${orderId}?token=${encodeURIComponent(token)}`)
      .then((res) => {
        if (!cancelled && res.data) {
          setStatus(res.data);
          const isDone =
            ["completed", "cancelled", "refunded"].includes(res.data.order.status) ||
            res.data.kitchenTicket?.status === "served";
          if (!isDone) {
            const nextInterval = res.data.order.status === "pending" ? 4_000 : 8_000;
            timerId = setTimeout(poll, nextInterval);
          }
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof SelfOrderApiError ? e.message : "Gagal mengambil status");
          timerId = setTimeout(poll, intervalMs);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    const handleVisibility = () => {
      if (typeof document !== "undefined" && !document.hidden && !timerId) {
        void poll();
      }
    };

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibility);
    }

    return () => {
      cancelled = true;
      if (timerId) clearTimeout(timerId);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVisibility);
      }
    };
  }, [orderId, token, intervalMs]);

  return { status, loading, error, setStatus };
}
