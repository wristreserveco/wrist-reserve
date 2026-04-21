"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient, isBrowserSupabaseReady } from "@/lib/supabase/client";

const items = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/products", label: "Products" },
  { href: "/admin/categories", label: "Categories" },
  { href: "/admin/hero", label: "Hero" },
  { href: "/admin/orders", label: "Orders", badge: "pending-orders" as const },
  { href: "/admin/messages", label: "Messages", badge: "unread-messages" as const },
];

export function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [pendingCount, setPendingCount] = useState(0);
  const [unreadMessages, setUnreadMessages] = useState(0);

  useEffect(() => {
    if (!isBrowserSupabaseReady()) return;

    const supabase = createClient();

    async function refreshPending() {
      const { count } = await supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("payment_status", "pending");
      setPendingCount(count ?? 0);
    }

    async function refreshUnread() {
      const { count } = await supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("sender", "user")
        .is("read_at", null);
      setUnreadMessages(count ?? 0);
    }

    void refreshPending();
    void refreshUnread();

    const orders = supabase
      .channel("sidebar-orders")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        () => {
          void refreshPending();
        }
      )
      .subscribe();

    const messages = supabase
      .channel("sidebar-messages")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages" },
        () => {
          void refreshUnread();
        }
      )
      .subscribe();

    const interval = setInterval(() => {
      void refreshPending();
      void refreshUnread();
    }, 30000);

    return () => {
      clearInterval(interval);
      void supabase.removeChannel(orders);
      void supabase.removeChannel(messages);
    };
  }, []);

  async function signOut() {
    if (!isBrowserSupabaseReady()) {
      router.push("/admin/login");
      return;
    }
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/admin/login");
    router.refresh();
  }

  function badgeCount(key: "pending-orders" | "unread-messages" | undefined) {
    if (key === "pending-orders") return pendingCount;
    if (key === "unread-messages") return unreadMessages;
    return 0;
  }

  return (
    <aside className="flex h-full w-56 shrink-0 flex-col border-r border-white/10 bg-zinc-950">
      <div className="border-b border-white/10 px-5 py-6">
        <p className="font-display text-sm tracking-[0.2em] text-white">WRIST RESERVE</p>
        <p className="mt-1 text-[10px] uppercase tracking-[0.2em] text-white/35">Admin</p>
      </div>
      <nav className="flex flex-1 flex-col gap-1 p-3">
        {items.map((item) => {
          const active = pathname === item.href;
          const count = badgeCount(item.badge);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center justify-between rounded-sm px-3 py-2 text-sm transition ${
                active ? "bg-white/10 text-white" : "text-white/55 hover:bg-white/5 hover:text-white"
              }`}
            >
              <span>{item.label}</span>
              {count > 0 ? (
                <span className="ml-2 inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-gold-400 px-1.5 text-[10px] font-semibold text-black">
                  {count > 99 ? "99+" : count}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-white/10 p-3">
        <button
          type="button"
          onClick={() => void signOut()}
          className="w-full rounded-sm px-3 py-2 text-left text-sm text-white/45 transition hover:bg-white/5 hover:text-white"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
