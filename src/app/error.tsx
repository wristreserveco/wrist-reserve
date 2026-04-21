"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[50vh] max-w-lg flex-col items-center justify-center px-4 py-24 text-center">
      <p className="text-xs uppercase tracking-[0.3em] text-white/40">Something broke</p>
      <h1 className="mt-4 font-display text-2xl text-white">We couldn&apos;t load this page</h1>
      <p className="mt-4 text-sm text-white/50">
        {error.message || "Try again, or check that Supabase env vars are set on your host."}
      </p>
      <button
        type="button"
        onClick={() => reset()}
        className="mt-10 rounded-sm border border-white/20 bg-white px-6 py-2.5 text-xs font-semibold uppercase tracking-[0.2em] text-black transition hover:bg-gold-200"
      >
        Try again
      </button>
    </div>
  );
}
