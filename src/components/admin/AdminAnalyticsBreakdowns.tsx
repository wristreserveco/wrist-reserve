import Link from "next/link";

type RefRow = { source_label: string; session_count: number };
type UtmRow = {
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  session_count: number;
};
type ProductRow = {
  product_id: string;
  view_count: number;
  unique_sessions: number;
};
type PathRow = { path: string; view_count: number };

export function AdminAnalyticsBreakdowns({
  topPaths,
  topReferrers,
  topUtm,
  topProducts,
}: {
  topPaths: PathRow[];
  topReferrers: RefRow[];
  topUtm: UtmRow[];
  topProducts: ProductRow[];
}) {
  const hasAny =
    topPaths.length > 0 ||
    topReferrers.length > 0 ||
    topUtm.length > 0 ||
    topProducts.length > 0;

  if (!hasAny) return null;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {topReferrers.length > 0 ? (
        <BreakdownCard title="Traffic sources (referrer)">
          <ul className="divide-y divide-white/10">
            {topReferrers.map((row) => (
              <li
                key={row.source_label}
                className="flex items-center justify-between gap-3 py-2 text-xs"
              >
                <span className="truncate text-white/80">{row.source_label}</span>
                <span className="shrink-0 tabular-nums text-gold-200/90">
                  {row.session_count} sessions
                </span>
              </li>
            ))}
          </ul>
        </BreakdownCard>
      ) : null}

      {topUtm.length > 0 ? (
        <BreakdownCard title="UTM campaigns">
          <ul className="divide-y divide-white/10">
            {topUtm.map((row) => (
              <li
                key={`${row.utm_source}-${row.utm_medium}-${row.utm_campaign}`}
                className="py-2 text-xs"
              >
                <p className="text-white/85">
                  <span className="text-gold-200/90">{row.utm_source}</span>
                  <span className="text-white/35"> · </span>
                  {row.utm_medium}
                  <span className="text-white/35"> · </span>
                  {row.utm_campaign}
                </p>
                <p className="mt-0.5 tabular-nums text-white/45">
                  {row.session_count} sessions
                </p>
              </li>
            ))}
          </ul>
        </BreakdownCard>
      ) : null}

      {topProducts.length > 0 ? (
        <BreakdownCard title="Product interest">
          <ul className="divide-y divide-white/10">
            {topProducts.map((row) => (
              <li
                key={row.product_id}
                className="flex items-center justify-between gap-3 py-2 text-xs"
              >
                <Link
                  href={`/products/${row.product_id}`}
                  target="_blank"
                  className="truncate font-mono text-gold-200/90 underline decoration-gold-500/30 underline-offset-2 hover:text-gold-100"
                >
                  /products/{row.product_id}
                </Link>
                <span className="shrink-0 text-right text-white/55">
                  <span className="tabular-nums text-white/80">{row.view_count}</span>{" "}
                  views
                  <span className="text-white/35"> · </span>
                  <span className="tabular-nums">{row.unique_sessions}</span> sessions
                </span>
              </li>
            ))}
          </ul>
        </BreakdownCard>
      ) : null}

      {topPaths.length > 0 ? (
        <BreakdownCard title="Top pages (all hits)">
          <ul className="divide-y divide-white/10">
            {topPaths.map((row) => (
              <li
                key={row.path}
                className="flex items-center justify-between gap-3 py-2 text-xs"
              >
                <span className="truncate font-mono text-white/80">{row.path}</span>
                <span className="shrink-0 tabular-nums text-gold-200/90">
                  {row.view_count} views
                </span>
              </li>
            ))}
          </ul>
        </BreakdownCard>
      ) : null}
    </div>
  );
}

function BreakdownCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-sm border border-white/10 bg-black/30 p-4">
      <h2 className="text-sm font-medium uppercase tracking-[0.2em] text-white/55">
        {title}
      </h2>
      <div className="mt-3">{children}</div>
    </div>
  );
}
