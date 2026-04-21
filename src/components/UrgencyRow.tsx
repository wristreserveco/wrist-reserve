const items = [
  { label: "Only 1 in stock" },
  { label: "Ships within 24h" },
  { label: "Free insured shipping" },
  { label: "30-day returns" },
];

export function UrgencyRow() {
  return (
    <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] uppercase tracking-[0.2em] text-white/55">
      {items.map((item, i) => (
        <span key={item.label} className="flex items-center gap-2">
          {i === 0 ? (
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gold-400 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-gold-400" />
            </span>
          ) : (
            <span className="h-1 w-1 rounded-full bg-white/25" />
          )}
          {item.label}
        </span>
      ))}
    </div>
  );
}
