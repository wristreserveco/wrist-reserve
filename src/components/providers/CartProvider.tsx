"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { Product } from "@/lib/types";

export interface CartLine {
  product: Product;
  quantity: number;
}

interface CartContextValue {
  lines: CartLine[];
  /** Add `qty` units of the product (default 1). Merges with existing line. */
  addLine: (product: Product, qty?: number) => void;
  /** Set an absolute quantity for a line. Passing <= 0 removes the line. */
  setQuantity: (productId: string, qty: number) => void;
  removeLine: (productId: string) => void;
  clear: () => void;
  count: number;
}

const CartContext = createContext<CartContextValue | null>(null);

const STORAGE_KEY = "wrist_reserve_cart_v1";

function loadFromStorage(): CartLine[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CartLine[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((l) => l?.product?.id);
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);

  useEffect(() => {
    setLines(loadFromStorage());
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
    } catch {
      /* ignore */
    }
  }, [lines]);

  const addLine = useCallback((product: Product, qty: number = 1) => {
    const bump = Math.max(1, Math.floor(qty));
    const cap = Math.max(1, product.quantity ?? 1);
    setLines((prev) => {
      const idx = prev.findIndex((l) => l.product.id === product.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = {
          ...next[idx],
          quantity: Math.min(cap, next[idx].quantity + bump),
        };
        return next;
      }
      return [...prev, { product, quantity: Math.min(cap, bump) }];
    });
  }, []);

  const setQuantity = useCallback((productId: string, qty: number) => {
    setLines((prev) => {
      const idx = prev.findIndex((l) => l.product.id === productId);
      if (idx < 0) return prev;
      const target = prev[idx];
      const cap = Math.max(1, target.product.quantity ?? 1);
      const clamped = Math.min(cap, Math.max(0, Math.floor(qty)));
      if (clamped === 0) return prev.filter((_, i) => i !== idx);
      const next = [...prev];
      next[idx] = { ...target, quantity: clamped };
      return next;
    });
  }, []);

  const removeLine = useCallback((productId: string) => {
    setLines((prev) => prev.filter((l) => l.product.id !== productId));
  }, []);

  const clear = useCallback(() => setLines([]), []);

  const count = useMemo(
    () => lines.reduce((acc, l) => acc + l.quantity, 0),
    [lines]
  );

  const value = useMemo(
    () => ({ lines, addLine, setQuantity, removeLine, clear, count }),
    [lines, addLine, setQuantity, removeLine, clear, count]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) {
    throw new Error("useCart must be used within CartProvider");
  }
  return ctx;
}
