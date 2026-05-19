import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { WordOfMouthWall } from "@/components/WordOfMouthWall";
import type { Testimonial } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Word of Mouth",
  description:
    "Real messages, DMs, and reactions from Wrist Reserve buyers — the conversations that don't fit on a product page.",
  openGraph: {
    title: "Word of Mouth — Wrist Reserve",
    description:
      "Real messages, DMs, and reactions from Wrist Reserve buyers.",
  },
};

/**
 * Public "Word of Mouth" wall.
 *
 * Server-renders the active testimonials, then hands off to the floating
 * polaroid wall client component for animation + lightbox.
 *
 * Tolerant of the table not existing yet — if migration 022 hasn't run we
 * render a polite "coming soon" state rather than 500.
 */
export default async function WordOfMouthPage() {
  let testimonials: Testimonial[] = [];

  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    try {
      const { data } = await supabase
        .from("testimonials")
        .select("*")
        .eq("active", true)
        .order("sort_order", { ascending: false })
        .order("posted_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(120);
      testimonials = (data ?? []) as Testimonial[];
    } catch {
      // Table not migrated yet — wall renders empty state below.
    }
  }

  return (
    <div className="min-h-[80vh] bg-black">
      <header className="mx-auto max-w-4xl px-4 pb-8 pt-12 text-center sm:px-6 sm:pt-16">
        <p className="text-xs uppercase tracking-[0.4em] text-gold-400/90">
          Word of Mouth
        </p>
        <h1 className="mt-3 font-display text-3xl text-white text-balance sm:text-5xl">
          From the DMs, in their own words.
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-xs leading-relaxed text-white/55 sm:text-sm">
          Reviews that don&rsquo;t fit on a product page. Screenshots from
          buyers — untouched.
        </p>
      </header>

      <section className="mx-auto max-w-7xl px-3 pb-20 sm:px-6 lg:px-8">
        <WordOfMouthWall testimonials={testimonials} />
      </section>
    </div>
  );
}
