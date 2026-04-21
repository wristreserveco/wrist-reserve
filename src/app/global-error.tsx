"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-black font-sans text-white antialiased">
        <div className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center px-4 text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-white/40">Fatal error</p>
          <h1 className="mt-4 font-display text-2xl text-white">App failed to render</h1>
          <p className="mt-4 text-sm text-white/50">
            {error.message || "Check the browser console and your deployment logs."}
          </p>
          <button
            type="button"
            onClick={() => reset()}
            className="mt-10 rounded-sm border border-gold-500/40 bg-gold-500/10 px-6 py-2.5 text-xs font-semibold uppercase tracking-[0.2em] text-gold-100"
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
