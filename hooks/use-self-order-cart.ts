"use client";

import { useCallback, useEffect, useState } from "react";

export type CartItem = {
  variantId: string;
  productId: string;
  name: string;
  variantName: string;
  price: number;
  quantity: number;
  notes?: string;
};

const STORAGE_KEY_PREFIX = "kedai-ku-self-order-cart:";

function keyOf(token: string) {
  return `${STORAGE_KEY_PREFIX}${token}`;
}

export function useSelfOrderCart(token: string) {
  const storageKey = keyOf(token);
  const [items, setItems] = useState<CartItem[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? (JSON.parse(raw) as CartItem[]) : [];
    } catch {
      return [];
    }
  });

  // Re-sync if token changes
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      setItems(raw ? (JSON.parse(raw) as CartItem[]) : []);
    } catch {
      setItems([]);
    }
  }, [storageKey]);

  // Persist to localStorage whenever items state changes
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(storageKey, JSON.stringify(items));
      } catch {
        // ignore quota errors
      }
    }
  }, [items, storageKey]);

  const add = useCallback((item: CartItem) => {
    setItems((prev) => {
      const existing = prev.find(
        (i) => i.variantId === item.variantId && (i.notes ?? "") === (item.notes ?? "")
      );
      if (existing) {
        return prev.map((i) =>
          i.variantId === item.variantId && (i.notes ?? "") === (item.notes ?? "")
            ? { ...i, quantity: i.quantity + item.quantity }
            : i
        );
      }
      return [...prev, item];
    });
  }, []);

  const updateQuantity = useCallback((variantId: string, notes: string | undefined, quantity: number) => {
    setItems((prev) => {
      if (quantity <= 0) {
        return prev.filter((i) => !(i.variantId === variantId && (i.notes ?? "") === (notes ?? "")));
      }
      return prev.map((i) =>
        i.variantId === variantId && (i.notes ?? "") === (notes ?? "")
          ? { ...i, quantity }
          : i
      );
    });
  }, []);

  const remove = useCallback((variantId: string, notes: string | undefined) => {
    setItems((prev) => prev.filter((i) => !(i.variantId === variantId && (i.notes ?? "") === (notes ?? ""))));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const totalItems = items.reduce((sum, i) => sum + i.quantity, 0);
  const totalAmount = items.reduce((sum, i) => sum + i.price * i.quantity, 0);

  return { items, add, updateQuantity, remove, clear, totalItems, totalAmount };
}
