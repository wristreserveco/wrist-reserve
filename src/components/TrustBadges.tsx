const items = [
  {
    title: "Ships Within 24 Hours",
    body: "Dispatched same or next business day from our secure vault.",
  },
  {
    title: "Discreet Insured Delivery",
    body: "Unmarked packaging, full transit insurance, signature on arrival.",
  },
  {
    title: "30-Day Satisfaction",
    body: "Not what you expected? Return within 30 days for a full refund.",
  },
];

export function TrustBadges() {
  return (
    <div className="mt-14 grid gap-6 border-y border-white/10 py-10 md:grid-cols-3">
      {items.map((item) => (
        <div key={item.title} className="text-center md:text-left">
          <p className="text-xs uppercase tracking-[0.25em] text-gold-400/90">{item.title}</p>
          <p className="mt-2 text-sm text-white/55">{item.body}</p>
        </div>
      ))}
    </div>
  );
}
