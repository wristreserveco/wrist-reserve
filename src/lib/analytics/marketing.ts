/**
 * Turn raw session rows into marketing-ready summaries (campaigns, hot leads, copy).
 */

export type SessionMarketingRow = {
  session_public_id: string;
  visitor_id: string;
  started_at: string;
  last_activity_at: string;
  landing_path: string | null;
  exit_path: string | null;
  referrer: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  page_view_count: number;
  engaged_ms: number;
  capture_email: string | null;
  capture_name: string | null;
  marketing_opt_in: boolean | null;
};

export type CampaignPerformance = {
  key: string;
  source: string;
  medium: string;
  campaign: string;
  /** Plain English, e.g. "Instagram · paid social · may-drop" */
  label: string;
  sessions: number;
  avgEngagedSec: number;
  bounceRatePct: number;
  productLooks: number;
  optIns: number;
  quality: "hot" | "warm" | "cold";
};

export type HotLead = {
  sessionPublicId: string;
  email: string | null;
  name: string | null;
  engagedSec: number;
  pageViews: number;
  channel: string;
  why: string;
};

export type MarketingInsights = {
  taggedSessions: number;
  organicSessions: number;
  campaigns: CampaignPerformance[];
  hotLeads: HotLead[];
  playbook: string[];
};

const SOURCE_LABELS: Record<string, string> = {
  ig: "Instagram",
  instagram: "Instagram",
  fb: "Facebook",
  facebook: "Facebook",
  meta: "Meta Ads",
  google: "Google",
  tiktok: "TikTok",
  youtube: "YouTube",
  email: "Email",
  sms: "SMS",
};

const MEDIUM_LABELS: Record<string, string> = {
  cpc: "Paid click",
  paid: "Paid",
  social: "Social post",
  story: "Story",
  reel: "Reel",
  email: "Email blast",
  organic: "Organic",
};

function labelPart(raw: string | null, map: Record<string, string>): string {
  const v = (raw ?? "").trim().toLowerCase();
  if (!v || v === "(none)" || v === "—") return "";
  return map[v] ?? raw!.trim();
}

export function describeCampaign(
  source: string | null,
  medium: string | null,
  campaign: string | null
): string {
  const parts = [
    labelPart(source, SOURCE_LABELS) || (source?.trim() ? source.trim() : "Unknown source"),
    labelPart(medium, MEDIUM_LABELS) || (medium?.trim() && medium !== "—" ? medium.trim() : ""),
    campaign?.trim() && campaign !== "—" ? campaign.trim() : "",
  ].filter(Boolean);
  return parts.join(" · ") || "Tagged link (unnamed)";
}

function campaignKey(s: SessionMarketingRow): string | null {
  if (!s.utm_source && !s.utm_medium && !s.utm_campaign) return null;
  return [
    (s.utm_source ?? "").trim().toLowerCase() || "(none)",
    (s.utm_medium ?? "").trim().toLowerCase() || "—",
    (s.utm_campaign ?? "").trim().toLowerCase() || "—",
  ].join("|");
}

function touchedProduct(s: SessionMarketingRow): boolean {
  const paths = [s.landing_path, s.exit_path].filter(Boolean).join(" ");
  return paths.includes("/products/");
}

function isHotLead(s: SessionMarketingRow): boolean {
  const engaged = s.engaged_ms >= 45_000;
  const deep = s.page_view_count >= 3;
  const product = touchedProduct(s);
  return (engaged && (deep || product)) || (product && s.page_view_count >= 2);
}

export function buildUtmUrl(
  siteBase: string,
  path: string,
  params: {
    utm_source: string;
    utm_medium: string;
    utm_campaign: string;
    utm_content?: string;
    utm_term?: string;
  }
): string {
  const base = siteBase.replace(/\/$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`${base}${p}`);
  url.searchParams.set("utm_source", params.utm_source.trim());
  url.searchParams.set("utm_medium", params.utm_medium.trim());
  url.searchParams.set("utm_campaign", params.utm_campaign.trim());
  if (params.utm_content?.trim()) {
    url.searchParams.set("utm_content", params.utm_content.trim());
  }
  if (params.utm_term?.trim()) {
    url.searchParams.set("utm_term", params.utm_term.trim());
  }
  return url.toString();
}

export function buildMarketingInsights(
  sessions: SessionMarketingRow[]
): MarketingInsights {
  const campaignMap = new Map<
    string,
    {
      source: string;
      medium: string;
      campaign: string;
      sessions: SessionMarketingRow[];
    }
  >();

  let tagged = 0;
  let organic = 0;

  for (const s of sessions) {
    const key = campaignKey(s);
    if (!key) {
      organic += 1;
      continue;
    }
    tagged += 1;
    const existing = campaignMap.get(key);
    if (existing) {
      existing.sessions.push(s);
    } else {
      campaignMap.set(key, {
        source: s.utm_source?.trim() || "(none)",
        medium: s.utm_medium?.trim() || "—",
        campaign: s.utm_campaign?.trim() || "—",
        sessions: [s],
      });
    }
  }

  const campaigns: CampaignPerformance[] = Array.from(campaignMap.values())
    .map((g) => {
      const n = g.sessions.length;
      const bounced = g.sessions.filter((s) => s.page_view_count <= 1).length;
      const avgEngaged =
        n > 0
          ? g.sessions.reduce((a, s) => a + s.engaged_ms, 0) / n / 1000
          : 0;
      const productLooks = g.sessions.filter(touchedProduct).length;
      const optIns = g.sessions.filter((s) => s.marketing_opt_in).length;
      const bounceRatePct = n > 0 ? (bounced / n) * 100 : 0;

      let quality: CampaignPerformance["quality"] = "cold";
      if (productLooks >= 2 || avgEngaged >= 60) quality = "hot";
      else if (productLooks >= 1 || avgEngaged >= 25 || n >= 5) quality = "warm";

      return {
        key: campaignKey(g.sessions[0]!)!,
        source: g.source,
        medium: g.medium,
        campaign: g.campaign,
        label: describeCampaign(g.source, g.medium, g.campaign),
        sessions: n,
        avgEngagedSec: Math.round(avgEngaged * 10) / 10,
        bounceRatePct: Math.round(bounceRatePct * 10) / 10,
        productLooks,
        optIns,
        quality,
      };
    })
    .sort((a, b) => b.sessions - a.sessions);

  const hotLeads: HotLead[] = sessions
    .filter(isHotLead)
    .sort((a, b) => b.engaged_ms - a.engaged_ms)
    .slice(0, 25)
    .map((s) => {
      const channel = s.utm_source
        ? describeCampaign(s.utm_source, s.utm_medium, s.utm_campaign)
        : s.referrer
          ? `Came from ${s.referrer}`
          : "Direct / unknown";
      const why: string[] = [];
      if (s.engaged_ms >= 60_000) why.push("stayed 1m+");
      if (s.page_view_count >= 3) why.push(`${s.page_view_count} pages`);
      if (touchedProduct(s)) why.push("viewed products");
      if (s.marketing_opt_in) why.push("opted in");
      return {
        sessionPublicId: s.session_public_id,
        email: s.capture_email,
        name: s.capture_name,
        engagedSec: Math.round(s.engaged_ms / 1000),
        pageViews: s.page_view_count,
        channel,
        why: why.join(" · "),
      };
    });

  const playbook: string[] = [];

  if (tagged === 0 && sessions.length > 0) {
    playbook.push(
      "You have traffic but no tagged campaign links yet. Use the link builder below on every IG story, ad, and bio link so you know what actually converts."
    );
  }

  const top = campaigns[0];
  if (top?.quality === "hot") {
    playbook.push(
      `Your best-performing tag right now is “${top.label}” (${top.sessions} visits, ${top.productLooks} looked at watches). Put more budget and content behind that same source + campaign name.`
    );
  }

  const weak = campaigns.find((c) => c.sessions >= 3 && c.bounceRatePct >= 70);
  if (weak) {
    playbook.push(
      `“${weak.label}” bounces hard (${weak.bounceRatePct}% leave after one page). Send that traffic to a specific product URL, not the homepage.`
    );
  }

  if (hotLeads.length > 0) {
    playbook.push(
      `${hotLeads.length} high-intent visit${hotLeads.length === 1 ? "" : "s"} in this window — open “Full journey”, add CRM notes, and follow up while they’re warm.`
    );
  }

  const optInCount = sessions.filter((s) => s.marketing_opt_in && s.capture_email).length;
  if (optInCount > 0) {
    playbook.push(
      `${optInCount} contact${optInCount === 1 ? "" : "s"} opted in — export the audience CSV and upload to Meta Custom Audiences or your email tool (only if you have permission).`
    );
  }

  if (playbook.length === 0 && sessions.length > 0) {
    playbook.push(
      "Keep tagging links on every post. After ~20 tagged sessions you’ll see which channel deserves more spend."
    );
  }

  return {
    taggedSessions: tagged,
    organicSessions: organic,
    campaigns,
    hotLeads,
    playbook,
  };
}
