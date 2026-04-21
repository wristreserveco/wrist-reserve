"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient, isBrowserSupabaseReady } from "@/lib/supabase/client";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    if (!isBrowserSupabaseReady()) {
      setError(
        "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY on your host, then redeploy."
      );
      setLoading(false);
      return;
    }
    const supabase = createClient();
    const { error: signError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (signError) {
      setError(signError.message);
      setLoading(false);
      return;
    }
    router.push("/admin");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-black px-4">
      <div className="w-full max-w-sm rounded-sm border border-white/10 bg-zinc-950 p-8 shadow-2xl">
        <p className="text-center font-display text-xl tracking-[0.2em] text-white">WRIST RESERVE</p>
        <p className="mt-2 text-center text-[10px] uppercase tracking-[0.25em] text-white/35">
          Admin sign in
        </p>
        <form onSubmit={onSubmit} className="mt-10 space-y-4">
          <label className="block text-xs uppercase tracking-[0.15em] text-white/40">
            Email
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-2 w-full rounded-sm border border-white/10 bg-black px-3 py-2 text-sm text-white outline-none focus:ring-1 focus:ring-gold-500/40"
              required
            />
          </label>
          <label className="block text-xs uppercase tracking-[0.15em] text-white/40">
            Password
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-2 w-full rounded-sm border border-white/10 bg-black px-3 py-2 text-sm text-white outline-none focus:ring-1 focus:ring-gold-500/40"
              required
            />
          </label>
          {error ? <p className="text-xs text-red-400/90">{error}</p> : null}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-sm bg-white py-3 text-xs font-semibold uppercase tracking-[0.25em] text-black transition hover:bg-gold-200 disabled:opacity-50"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
