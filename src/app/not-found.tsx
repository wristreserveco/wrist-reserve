import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[50vh] max-w-lg flex-col items-center justify-center px-4 text-center">
      <p className="text-xs uppercase tracking-[0.35em] text-white/35">404</p>
      <h1 className="mt-4 font-display text-3xl text-white">This page cannot be found.</h1>
      <Link
        href="/"
        className="mt-10 text-sm text-gold-300 underline-offset-4 transition hover:underline"
      >
        Back home
      </Link>
    </div>
  );
}
