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
  const [items, setItems] = useState<CartItem[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      setItems(raw ? (JSON.parse(raw) as CartItem[]) : []);
    } catch {
      setItems([]);
    }
  }, [storageKey]);

  const persist = useCallback((next: CartItem[]) => {
    setItems(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      // ignore quota errors
    }
  }, [storageKey]);

  const add = useCallback((item: CartItem) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.variantId === item.variantId && (i.notes ?? "") === (item.notes ?? ""));
      const next = existing
        ? prev.map((i) => (i.variantId === item.variantId && (i.notes ?? "") === (item.notes ?? "") ? { ...i, quantity: i.quantity + item.quantity } : i))
        : [...prev, item];
      persist(next);
      return next;
    });
  }, [persist]);

  const updateQuantity = useCallback((variantId: string, notes: string | undefined, quantity: number) => {
    setItems((prev) => {
      const next = quantity <= 0
        ? prev.filter((i) => !(i.variantId === variantId && (i.notes ?? "") === (notes ?? "")))
        : prev.map((i) => (i.variantId === variantId && (i.notes ?? "") === (notes ?? "") ? { ...i, quantity } : i));
      persist(next);
      return next;
    });
  }, [persist]);

  const remove = useCallback((variantId: string, notes: string | undefined) => {
    setItems((prev) => {
      const next = prev.filter((i) => !(i.variantId === variantId && (i.notes ?? "") === (notes ?? "")));
      persist(next);
      return next;
    });
  }, [persist]);

  const clear = useCallback(() => persist([]), [persist]);

  const totalItems = items.reduce((sum, i) => sum + i.quantity, 0);
  const totalAmount = items.reduce((sum, i) => sum + i.price * i.quantity, 0);

  return { items, add, updateQuantity, remove, clear, totalItems, totalAmount };
}
