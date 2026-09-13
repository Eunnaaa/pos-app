"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/client";

export type PosProduct = {
  id: string; // variant id
  productId: string;
  name: string;
  category: string;
  price: number;
  stock: number;
  trackStock: boolean;
  sku: string;
  barcode: string | null;
  imageUrl: string | null;
  thumbnailUrl?: string | null;
};

export type PosCustomer = {
  id: string;
  name: string;
  code: string;
  phone?: string | null;
};

export type PosTable = {
  id: string;
  name: string;
  capacity: number;
  status?: string;
};

export type PosBootstrapResult = {
  products: PosProduct[];
  categories: string[];
  customers: PosCustomer[];
  tables: PosTable[];
};

const CACHE_PREFIX = "kedai-ku-pos-bootstrap";

export function usePosBootstrap(branchId?: string, warehouseId?: string) {
  const [data, setData] = useState<PosBootstrapResult>({
    products: [],
    categories: ["Semua"],
    customers: [],
    tables: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const isMountedRef = useRef(true);

  const cacheKey = branchId ? `${CACHE_PREFIX}:${branchId}:${warehouseId || "default"}` : null;

  // 1. Instant load from local cache if available (< 50ms)
  useEffect(() => {
    if (!cacheKey || typeof window === "undefined") return;
    try {
      const cachedStr = sessionStorage.getItem(cacheKey);
      if (cachedStr) {
        const parsed = JSON.parse(cachedStr) as PosBootstrapResult;
        if (parsed?.products && Array.isArray(parsed.products) && parsed.products.length > 0) {
          setData(parsed);
          setLoading(false);
        }
      }
    } catch {
      // Ignore cache parse errors
    }
  }, [cacheKey]);

  // 2. Fetch fresh bootstrap data from backend
  const fetchBootstrap = useCallback(
    async (bypassCache = false) => {
      if (!branchId) {
        setLoading(false);
        return;
      }

      // Only show full-screen loader if there is no data at all yet
      setData((curr) => {
        if (!curr.products.length) {
          setLoading(true);
        }
        return curr;
      });
      setError("");

      try {
        const params = new URLSearchParams();
        params.set("branchId", branchId);
        if (warehouseId) params.set("warehouseId", warehouseId);
        if (bypassCache) params.set("fresh", "true");

        const response = await apiFetch<PosBootstrapResult>(`/api/v1/pos/bootstrap?${params.toString()}`);
        if (response?.data && isMountedRef.current) {
          setData(response.data);
          if (cacheKey && typeof window !== "undefined") {
            try {
              sessionStorage.setItem(cacheKey, JSON.stringify(response.data));
            } catch {
              // Ignore sessionStorage quota errors
            }
          }
        }
      } catch (caught) {
        if (isMountedRef.current) {
          setError(caught instanceof Error ? caught.message : "Gagal memuat katalog POS");
        }
      } finally {
        if (isMountedRef.current) {
          setLoading(false);
        }
      }
    },
    [branchId, warehouseId, cacheKey],
  );

  useEffect(() => {
    isMountedRef.current = true;
    void fetchBootstrap(false);
    return () => {
      isMountedRef.current = false;
    };
  }, [fetchBootstrap]);

  const refresh = useCallback(
    async (bypassCache = true) => {
      await fetchBootstrap(bypassCache);
    },
    [fetchBootstrap],
  );

  return {
    products: data.products,
    categories: data.categories,
    customers: data.customers,
    tables: data.tables,
    loading,
    error,
    refresh,
  };
}
