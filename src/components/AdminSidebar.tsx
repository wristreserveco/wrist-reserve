"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient, isBrowserSupabaseReady } from "@/lib/supabase/client";

const items: {
  href: string;
  label: string;
  badge?: "pending-orders" | "unread-messages" | "ready-to-ship";
  /** Draw attention — full visitor analytics lives here. */
  accent?: boolean;
}[] = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/analytics", label: "Visitor analytics", accent: true },
  { href: "/admin/products", label: "Products" },
  { href: "/admin/categories", label: "Categories" },
  { href: "/admin/hero", label: "Hero" },
  { href: "/admin/orders", label: "Orders", badge: "pending-orders" as const },
  { href: "/admin/shipping", label: "Fulfill", badge: "ready-to-ship" as const },
  { href: "/admin/messages", label: "Messages", badge: "unread-messages" as const },
  { href: "/admin/reviews", label: "Reviews" },
  { href: "/admin/testimonials", label: "Word of Mouth" },
  { href: "/admin/audit", label: "Audit log" },
];

/**
 * Admin navigation.
 *
 * Two layouts behind one component:
 *  - Desktop (md:+): a fixed 224px sidebar on the left, exactly as before.
 *  - Mobile (<md):   a sticky top bar with a hamburger that slides a
 *                    full-height drawer in from the left. The drawer auto-
 *                    closes on route change or backdrop tap so monitoring
 *                    on a phone takes one tap to switch sections.
 *
 * Live Supabase counts (pending orders, ready-to-ship, unread messages)
 * are surfaced in BOTH layouts — as inline pill badges in the drawer and
 * a single combined notification dot on the top bar so you can see at a
 * glance whether anything needs attention without opening the menu.
 */
export function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [pendingCount, setPendingCount] = useState(0);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [readyToShipCount, setReadyToShipCount] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Close the drawer whenever the route changes — single tap to navigate.
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  // Lock body scroll while the drawer is open so the page underneath
  // doesn't scroll when the user swipes the drawer.
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (drawerOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [drawerOpen]);

  // ESC closes the drawer.
  useEffect(() => {
    if (!drawerOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setDrawerOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

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

    async function refreshReadyToShip() {
      try {
        const { count } = await supabase
          .from("orders")
          .select("id", { count: "exact", head: true })
          .eq("payment_status", "paid")
          .is("shipped_at", null);
        setReadyToShipCount(count ?? 0);
      } catch {
        setReadyToShipCount(0);
      }
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
    void refreshReadyToShip();
    void refreshUnread();

    const orders = supabase
      .channel("sidebar-orders")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        () => {
          void refreshPending();
          void refreshReadyToShip();
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
      void refreshReadyToShip();
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

  function badgeCount(
    key: "pending-orders" | "unread-messages" | "ready-to-ship" | undefined
  ) {
    if (key === "pending-orders") return pendingCount;
    if (key === "unread-messages") return unreadMessages;
    if (key === "ready-to-ship") return readyToShipCount;
    return 0;
  }

  const totalAlerts = pendingCount + unreadMessages + readyToShipCount;
  const activeLabel =
    items.find((i) => i.href === pathname)?.label ??
    (pathname?.startsWith("/admin/orders")
      ? "Orders"
      : pathname?.startsWith("/admin/products")
      ? "Products"
      : pathname?.startsWith("/admin/analytics")
      ? "Visitor analytics"
      : "Admin");

  // Shared nav body — rendered inside both the desktop sidebar and the
  // mobile drawer so they stay in sync.
  const navBody = (
    <>
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
        {items.map((item) => {
          const active = pathname === item.href;
          const count = badgeCount(item.badge);
          const accent = item.accent && !active;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setDrawerOpen(false)}
              className={`flex items-center justify-between rounded-sm px-3 py-3 text-base transition md:py-2 md:text-sm ${
                active
                  ? "bg-white/10 text-white"
                  : accent
                  ? "border border-gold-500/35 bg-gold-500/[0.06] text-gold-100 hover:border-gold-400/60 hover:bg-gold-500/10"
                  : "text-white/55 hover:bg-white/5 hover:text-white"
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
          className="w-full rounded-sm px-3 py-3 text-left text-base text-white/45 transition hover:bg-white/5 hover:text-white md:py-2 md:text-sm"
        >
          Sign out
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* ───────────────────────── Mobile top bar ───────────────────────── */}
      <div className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-white/10 bg-black/95 px-3 backdrop-blur md:hidden">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label="Open admin menu"
          className="relative flex h-10 w-10 items-center justify-center rounded-sm border border-white/15 text-white transition hover:border-white"
        >
          {/* Hamburger */}
          <span className="flex flex-col gap-[5px]">
            <span className="block h-[2px] w-5 bg-current" />
            <span className="block h-[2px] w-5 bg-current" />
            <span className="block h-[2px] w-5 bg-current" />
          </span>
          {totalAlerts > 0 ? (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-gold-400 px-1 text-[9px] font-semibold text-black">
              {totalAlerts > 99 ? "99+" : totalAlerts}
            </span>
          ) : null}
        </button>

        <Link
          href="/admin"
          className="flex flex-col items-center"
          aria-label="Admin home"
        >
          <span className="font-display text-[11px] tracking-[0.22em] text-gold-300">
            WRIST RESERVE
          </span>
          <span className="-mt-0.5 text-[9px] uppercase tracking-[0.22em] text-white/45">
            {activeLabel}
          </span>
        </Link>

        <Link
          href="/"
          target="_blank"
          aria-label="View storefront"
          className="flex h-10 w-10 items-center justify-center rounded-sm border border-white/15 text-white/70 transition hover:border-white hover:text-white"
        >
          ↗
        </Link>
      </div>

      {/* ───────────────────────── Mobile drawer backdrop ────────────────── */}
      {drawerOpen ? (
        <button
          type="button"
          onClick={() => setDrawerOpen(false)}
          aria-label="Close admin menu"
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm md:hidden"
        />
      ) : null}

      {/* ───────────────────────── Sidebar / drawer ──────────────────────── */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex h-full w-72 shrink-0 flex-col border-r border-white/10 bg-zinc-950 transition-transform duration-300 ease-out md:sticky md:top-0 md:h-screen md:w-56 md:translate-x-0 ${
          drawerOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
        aria-label="Admin navigation"
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-5 md:py-6">
          <div>
            <p className="font-display text-sm tracking-[0.2em] text-white">
              WRIST RESERVE
            </p>
            <p className="mt-1 text-[10px] uppercase tracking-[0.2em] text-white/35">
              Admin
            </p>
          </div>
          {/* Close button — drawer-only */}
          <button
            type="button"
            onClick={() => setDrawerOpen(false)}
            aria-label="Close menu"
            className="flex h-9 w-9 items-center justify-center rounded-sm border border-white/15 text-white/70 transition hover:border-white hover:text-white md:hidden"
          >
            ×
          </button>
        </div>
        {navBody}
      </aside>
    </>
  );
}
