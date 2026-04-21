"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { createClient, isBrowserSupabaseReady } from "@/lib/supabase/client";
import { formatPrice } from "@/lib/products";

interface NewOrderToast {
  id: string;
  productName: string;
  amount: number;
  method: string;
  customerName: string | null;
}

interface OrderRealtimeRow {
  id: string;
  product_id: string | null;
  amount: string | number;
  payment_method: string | null;
  payment_status: string | null;
  customer_name: string | null;
  created_at: string;
}

export function AdminAlerts() {
  const [toasts, setToasts] = useState<NewOrderToast[]>([]);
  const [soundReady, setSoundReady] = useState(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const productCache = useRef<Map<string, string>>(new Map());
  const mountedAt = useRef<number>(Date.now());

  /** Prime the audio context after the first user interaction (browser policy). */
  useEffect(() => {
    const arm = () => {
      try {
        const AC =
          typeof window !== "undefined"
            ? window.AudioContext ||
              (window as unknown as { webkitAudioContext?: typeof AudioContext })
                .webkitAudioContext
            : null;
        if (!AC) return;
        if (!audioCtxRef.current) audioCtxRef.current = new AC();
        setSoundReady(true);
      } catch {
        // ignore
      }
      window.removeEventListener("pointerdown", arm);
      window.removeEventListener("keydown", arm);
    };
    window.addEventListener("pointerdown", arm);
    window.addEventListener("keydown", arm);
    return () => {
      window.removeEventListener("pointerdown", arm);
      window.removeEventListener("keydown", arm);
    };
  }, []);

  function chime() {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    const now = ctx.currentTime;
    [880, 1320].forEach((freq, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = freq;
      g.gain.setValueAtTime(0, now + i * 0.18);
      g.gain.linearRampToValueAtTime(0.2, now + i * 0.18 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.18 + 0.45);
      o.connect(g).connect(ctx.destination);
      o.start(now + i * 0.18);
      o.stop(now + i * 0.18 + 0.5);
    });
  }

  async function fetchProductName(productId: string | null): Promise<string> {
    if (!productId) return "Order";
    const cached = productCache.current.get(productId);
    if (cached) return cached;
    try {
      const supabase = createClient();
      const { data } = await supabase
        .from("products")
        .select("name")
        .eq("id", productId)
        .maybeSingle();
      const name = (data?.name as string) || "Order";
      productCache.current.set(productId, name);
      return name;
    } catch {
      return "Order";
    }
  }

  useEffect(() => {
    if (!isBrowserSupabaseReady()) return;

    const supabase = createClient();
    const channel = supabase
      .channel("admin-orders")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "orders" },
        async (payload) => {
          const row = payload.new as OrderRealtimeRow;
          // Skip anything older than this session (reconnect safety).
          if (new Date(row.created_at).getTime() < mountedAt.current - 3000) return;
          const productName = await fetchProductName(row.product_id);
          const toast: NewOrderToast = {
            id: row.id,
            productName,
            amount: Number(row.amount),
            method: row.payment_method ?? "order",
            customerName: row.customer_name,
          };
          setToasts((t) => [toast, ...t].slice(0, 4));
          chime();
          if (typeof document !== "undefined") {
            const original = document.title;
            document.title = "● NEW ORDER — " + original.replace(/^● NEW ORDER — /, "");
            setTimeout(() => {
              document.title = original;
            }, 8000);
          }
          setTimeout(() => {
            setToasts((t) => t.filter((x) => x.id !== toast.id));
          }, 15000);
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-50 flex w-[min(360px,calc(100vw-2rem))] flex-col gap-3">
      {!soundReady ? (
        <div className="pointer-events-auto rounded-sm border border-gold-400/40 bg-gold-400/10 px-3 py-2 text-[10px] uppercase tracking-[0.2em] text-gold-100">
          Click anywhere once to enable new-order sound alerts
        </div>
      ) : null}
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, x: 40, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 20, scale: 0.98 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="pointer-events-auto overflow-hidden rounded-sm border border-gold-400/40 bg-black/90 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.8)] backdrop-blur"
          >
            <div className="flex items-start justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-[0.22em] text-gold-300">
                  New {t.method} order
                </p>
                <p className="mt-1 truncate font-display text-lg text-white">
                  {t.productName}
                </p>
                <p className="mt-0.5 text-xs text-white/60">
                  {formatPrice(t.amount)}
                  {t.customerName ? ` · ${t.customerName}` : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  setToasts((x) => x.filter((y) => y.id !== t.id))
                }
                className="text-white/40 transition hover:text-white"
                aria-label="Dismiss"
              >
                ×
              </button>
            </div>
            <Link
              href="/admin/orders"
              className="block border-t border-white/10 bg-white/[0.02] px-4 py-2 text-[10px] uppercase tracking-[0.22em] text-white/70 transition hover:bg-white/10 hover:text-white"
            >
              Open orders →
            </Link>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
