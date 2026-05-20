"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { MarketingInsights } from "@/lib/analytics/marketing";
import { buildUtmUrl } from "@/lib/analytics/marketing";

const PRESETS = [
  {
    name: "Instagram Story",
    source: "instagram",
    medium: "story",
    campaign: "story-drop",
  },
  {
    name: "Instagram Bio",
    source: "instagram",
    medium: "social",
    campaign: "bio-link",
  },
  {
    name: "Meta Ad",
    source: "meta",
    medium: "paid",
    campaign: "prospecting",
  },
  {
    name: "Google Ad",
    source: "google",
    medium: "cpc",
    campaign: "brand-search",
  },
];

export function AdminMarketingHub({
  insights,
  siteUrl,
  days,
}: {
  insights: MarketingInsights;
  siteUrl: string;
  days: number;
}) {
  const [source, setSource] = useState("instagram");
  const [medium, setMedium] = useState("story");
  const [campaign, setCampaign] = useState("");
  const [path, setPath] = useState("/shop");
  const [content, setContent] = useState("");
  const [copied, setCopied] = useState(false);

  const taggedUrl = useMemo(() => {
    if (!campaign.trim()) return "";
    return buildUtmUrl(siteUrl, path, {
      utm_source: source,
      utm_medium: medium,
      utm_campaign: campaign,
      utm_content: content || undefined,
    });
  }, [siteUrl, path, source, medium, campaign, content]);

  async function copyLink() {
    if (!taggedUrl) return;
    try {
      await navigator.clipboard.writeText(taggedUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  const qualityColor = {
    hot: "text-emerald-300 border-emerald-500/40 bg-emerald-500/10",
    warm: "text-amber-200 border-amber-500/35 bg-amber-500/10",
    cold: "text-white/50 border-white/15 bg-white/[0.03]",
  };

  return (
    <div className="space-y-6">
      <div className="rounded-sm border border-gold-500/30 bg-gradient-to-br from-gold-500/[0.08] via-black to-black p-5 sm:p-6">
        <p className="text-[10px] uppercase tracking-[0.32em] text-gold-300/90">
          Marketing playbook
        </p>
        <h2 className="mt-2 font-display text-2xl text-white">
          Turn traffic into campaigns that scale
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-white/60">
          <strong className="font-normal text-white/85">UTM tags</strong> are extra
          parameters on your links (
          <code className="text-[11px] text-gold-200/90">utm_source</code>,{" "}
          <code className="text-[11px] text-gold-200/90">utm_campaign</code>, etc.).
          When someone taps your Instagram story or Meta ad, we record which post/ad
          sent them — so you know what to spend more on instead of guessing.
        </p>
        <p className="mt-2 max-w-3xl text-sm text-white/45">
          Tagged visits this period:{" "}
          <span className="text-white/80">{insights.taggedSessions}</span> · Organic /
          untagged: <span className="text-white/80">{insights.organicSessions}</span>
        </p>
      </div>

      {insights.playbook.length > 0 ? (
        <div className="rounded-sm border border-white/10 bg-black/40 p-4">
          <p className="text-[10px] uppercase tracking-[0.28em] text-gold-300/80">
            What to do next
          </p>
          <ul className="mt-3 space-y-2 text-sm text-white/70">
            {insights.playbook.map((line) => (
              <li key={line} className="flex gap-2">
                <span className="text-gold-400">→</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-sm border border-white/10 bg-black/30 p-4">
          <p className="text-[10px] uppercase tracking-[0.28em] text-white/40">
            Campaign link builder
          </p>
          <p className="mt-1 text-xs text-white/45">
            Paste this link in IG bio, stories, Meta ads, SMS — never the plain URL.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.name}
                type="button"
                onClick={() => {
                  setSource(p.source);
                  setMedium(p.medium);
                  setCampaign(p.campaign);
                }}
                className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-white/50 transition hover:border-gold-400/40 hover:text-gold-200"
              >
                {p.name}
              </button>
            ))}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-[10px] uppercase tracking-[0.15em] text-white/40">
              Source (platform)
              <input
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder="instagram"
                className="mt-1 w-full rounded-sm border border-white/10 bg-black px-2 py-2 text-sm text-white"
              />
            </label>
            <label className="text-[10px] uppercase tracking-[0.15em] text-white/40">
              Medium (type)
              <input
                value={medium}
                onChange={(e) => setMedium(e.target.value)}
                placeholder="story"
                className="mt-1 w-full rounded-sm border border-white/10 bg-black px-2 py-2 text-sm text-white"
              />
            </label>
            <label className="text-[10px] uppercase tracking-[0.15em] text-white/40 sm:col-span-2">
              Campaign name (your label)
              <input
                value={campaign}
                onChange={(e) => setCampaign(e.target.value)}
                placeholder="may-sub-drop"
                className="mt-1 w-full rounded-sm border border-white/10 bg-black px-2 py-2 text-sm text-white"
              />
            </label>
            <label className="text-[10px] uppercase tracking-[0.15em] text-white/40">
              Landing path
              <input
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder="/shop"
                className="mt-1 w-full rounded-sm border border-white/10 bg-black px-2 py-2 text-sm text-white"
              />
            </label>
            <label className="text-[10px] uppercase tracking-[0.15em] text-white/40">
              Content (optional, A/B)
              <input
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="hook-a"
                className="mt-1 w-full rounded-sm border border-white/10 bg-black px-2 py-2 text-sm text-white"
              />
            </label>
          </div>
          {taggedUrl ? (
            <div className="mt-4">
              <p className="break-all rounded-sm border border-gold-500/25 bg-gold-500/5 p-3 font-mono text-[11px] text-gold-100/90">
                {taggedUrl}
              </p>
              <button
                type="button"
                onClick={() => void copyLink()}
                className="mt-3 rounded-sm bg-gold-400 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-black transition hover:bg-gold-300"
              >
                {copied ? "Copied ✓" : "Copy tagged link"}
              </button>
            </div>
          ) : (
            <p className="mt-3 text-xs text-white/40">Enter a campaign name to generate the link.</p>
          )}
        </div>

        <div className="rounded-sm border border-white/10 bg-black/30 p-4">
          <p className="text-[10px] uppercase tracking-[0.28em] text-white/40">
            Export for ads & email
          </p>
          <p className="mt-1 text-xs leading-relaxed text-white/45">
            Download contacts and session rows for Meta Custom Audiences, Klaviyo, or
            your spreadsheet. Only use emails you are allowed to market to.
          </p>
          <div className="mt-4 flex flex-col gap-2">
            <a
              href={`/api/admin/analytics/export?days=${days}`}
              className="rounded-sm border border-white/15 px-4 py-2.5 text-center text-[10px] font-semibold uppercase tracking-[0.2em] text-white/80 transition hover:border-white/35 hover:text-white"
            >
              All sessions CSV
            </a>
            <a
              href={`/api/admin/analytics/export/audiences?days=${days}`}
              className="rounded-sm border border-gold-400/40 bg-gold-400/10 px-4 py-2.5 text-center text-[10px] font-semibold uppercase tracking-[0.2em] text-gold-200 transition hover:bg-gold-400/15"
            >
              Hot leads + opt-ins CSV →
            </a>
          </div>
        </div>
      </div>

      {insights.campaigns.length > 0 ? (
        <div className="rounded-sm border border-white/10 bg-black/30 p-4">
          <p className="text-[10px] uppercase tracking-[0.28em] text-white/40">
            Campaign scoreboard
          </p>
          <p className="mt-1 text-xs text-white/45">
            Each row is one tagged link combo you used.{" "}
            <span className="text-emerald-300/90">Hot</span> = people stayed and looked
            at watches.
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead>
                <tr className="border-b border-white/10 text-[10px] uppercase tracking-[0.16em] text-white/40">
                  <th className="py-2 pr-3">Campaign</th>
                  <th className="py-2 pr-3">Visits</th>
                  <th className="py-2 pr-3">Avg time</th>
                  <th className="py-2 pr-3">Bounce</th>
                  <th className="py-2 pr-3">Saw products</th>
                  <th className="py-2">Quality</th>
                </tr>
              </thead>
              <tbody>
                {insights.campaigns.map((c) => (
                  <tr key={c.key} className="border-b border-white/5">
                    <td className="max-w-[220px] py-2.5 pr-3 text-white/85">{c.label}</td>
                    <td className="py-2.5 pr-3 tabular-nums">{c.sessions}</td>
                    <td className="py-2.5 pr-3 tabular-nums">{c.avgEngagedSec}s</td>
                    <td className="py-2.5 pr-3 tabular-nums">{c.bounceRatePct}%</td>
                    <td className="py-2.5 pr-3 tabular-nums">{c.productLooks}</td>
                    <td className="py-2.5">
                      <span
                        className={`inline-block rounded-full border px-2 py-0.5 text-[9px] uppercase tracking-[0.14em] ${qualityColor[c.quality]}`}
                      >
                        {c.quality}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="rounded-sm border border-dashed border-white/15 bg-black/20 px-4 py-8 text-center text-sm text-white/45">
          No tagged campaigns yet. Build a link above, post it, then check back — this
          table fills automatically.
        </div>
      )}

      {insights.hotLeads.length > 0 ? (
        <div className="rounded-sm border border-white/10 bg-black/30 p-4">
          <p className="text-[10px] uppercase tracking-[0.28em] text-white/40">
            High-intent visitors (follow up)
          </p>
          <ul className="mt-3 divide-y divide-white/10">
            {insights.hotLeads.map((lead) => (
              <li
                key={lead.sessionPublicId}
                className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-xs"
              >
                <div className="min-w-0">
                  <p className="text-white/85">
                    {lead.email ?? lead.name ?? "Anonymous visitor"}
                  </p>
                  <p className="mt-0.5 text-white/45">
                    {lead.why} · {lead.channel}
                  </p>
                </div>
                <Link
                  href={`/admin/analytics?days=${days}&session=${encodeURIComponent(lead.sessionPublicId)}`}
                  className="shrink-0 text-[10px] uppercase tracking-[0.18em] text-gold-200/90 underline"
                >
                  Journey →
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
