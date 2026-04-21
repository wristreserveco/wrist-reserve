const reviews = [
  {
    name: "James R.",
    location: "New York",
    text: "Flawless transaction. The piece arrived exactly as described, with full documentation.",
  },
  {
    name: "Elena V.",
    location: "London",
    text: "Impeccable curation. This is how luxury should feel online — calm, precise, trustworthy.",
  },
  {
    name: "Marcus T.",
    location: "Singapore",
    text: "Responsive team, insured shipping, and a watch that exceeded expectations.",
  },
];

export function ProductReviews() {
  return (
    <section className="mt-20 border-t border-white/10 pt-14">
      <h2 className="font-display text-2xl text-white">Client notes</h2>
      <p className="mt-2 text-sm text-white/45">A selection of recent feedback from collectors.</p>
      <div className="mt-10 grid gap-6 md:grid-cols-3">
        {reviews.map((r) => (
          <blockquote
            key={r.name}
            className="rounded-sm border border-white/5 bg-white/[0.02] p-6 transition hover:border-gold-500/20"
          >
            <p className="text-sm leading-relaxed text-white/75">&ldquo;{r.text}&rdquo;</p>
            <footer className="mt-4 text-xs uppercase tracking-[0.2em] text-white/35">
              {r.name}
              <span className="mx-2 text-white/20">·</span>
              {r.location}
            </footer>
          </blockquote>
        ))}
      </div>
    </section>
  );
}
