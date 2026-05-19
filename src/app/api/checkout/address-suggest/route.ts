/**
 * Address autocomplete proxy.
 *
 * Backed by Komoot's Photon (https://photon.komoot.io) — free, no API key,
 * built on OpenStreetMap. We proxy through our own endpoint so we can:
 *
 *   - Hide the upstream provider from the client (privacy + reduces XSS
 *     surface for any future API-key auth schemes).
 *   - Rate-limit per IP so an abuser can't drive up our outbound traffic.
 *   - Swap providers later (Google Places, Mapbox, Smarty) by changing
 *     only this file — the client contract stays the same.
 *
 * USPS verification still happens on submit via Shippo — autocomplete is
 * only a convenience to reduce typos before that hard check.
 *
 * Response shape — always:
 *
 *     { suggestions: Array<{
 *         label: string;
 *         street1: string;
 *         city: string;
 *         state: string;
 *         zip: string;
 *         country: string;
 *       }> }
 */

import { NextResponse } from "next/server";
import {
  rateLimit,
  clientIpFromRequest,
  tooManyResponse,
} from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const US_STATE_NAME_TO_CODE: Record<string, string> = {
  alabama: "AL",
  alaska: "AK",
  arizona: "AZ",
  arkansas: "AR",
  california: "CA",
  colorado: "CO",
  connecticut: "CT",
  delaware: "DE",
  "district of columbia": "DC",
  florida: "FL",
  georgia: "GA",
  hawaii: "HI",
  idaho: "ID",
  illinois: "IL",
  indiana: "IN",
  iowa: "IA",
  kansas: "KS",
  kentucky: "KY",
  louisiana: "LA",
  maine: "ME",
  maryland: "MD",
  massachusetts: "MA",
  michigan: "MI",
  minnesota: "MN",
  mississippi: "MS",
  missouri: "MO",
  montana: "MT",
  nebraska: "NE",
  nevada: "NV",
  "new hampshire": "NH",
  "new jersey": "NJ",
  "new mexico": "NM",
  "new york": "NY",
  "north carolina": "NC",
  "north dakota": "ND",
  ohio: "OH",
  oklahoma: "OK",
  oregon: "OR",
  pennsylvania: "PA",
  "puerto rico": "PR",
  "rhode island": "RI",
  "south carolina": "SC",
  "south dakota": "SD",
  tennessee: "TN",
  texas: "TX",
  utah: "UT",
  vermont: "VT",
  virginia: "VA",
  washington: "WA",
  "west virginia": "WV",
  wisconsin: "WI",
  wyoming: "WY",
};

interface PhotonProperties {
  housenumber?: string;
  street?: string;
  city?: string;
  town?: string;
  village?: string;
  locality?: string;
  suburb?: string;
  hamlet?: string;
  district?: string;
  municipality?: string;
  county?: string;
  state?: string;
  postcode?: string;
  country?: string;
  countrycode?: string;
  name?: string;
  type?: string;
  osm_value?: string;
}

interface PhotonFeature {
  properties: PhotonProperties;
}

interface PhotonResponse {
  features: PhotonFeature[];
}

interface Suggestion {
  label: string;
  street1: string;
  city: string;
  state: string;
  zip: string;
  country: string;
}

function toStateCode(stateRaw: string | undefined): string {
  if (!stateRaw) return "";
  const t = stateRaw.trim();
  if (/^[A-Za-z]{2}$/.test(t)) return t.toUpperCase();
  const lower = t.toLowerCase();
  return US_STATE_NAME_TO_CODE[lower] ?? "";
}

function pickCity(p: PhotonProperties): string {
  const candidates = [
    p.city,
    p.town,
    p.village,
    p.locality,
    p.suburb,
    p.hamlet,
    p.municipality,
    p.district,
  ];
  for (const c of candidates) {
    const t = (c ?? "").trim();
    if (t) return t;
  }
  return "";
}

function buildStreet1(p: PhotonProperties): string {
  const parts: string[] = [];
  if (p.housenumber) parts.push(p.housenumber.trim());
  if (p.street) parts.push(p.street.trim());
  const joined = parts.join(" ").trim();
  if (joined) return joined;
  const name = (p.name ?? "").trim();
  if (name && (p.type === "house" || p.type === "building")) return name;
  if (name && (p.type === "street" || p.osm_value === "residential")) return name;
  return "";
}

function buildSuggestion(p: PhotonProperties): Suggestion | null {
  const country = (p.countrycode || "").toUpperCase();
  if (country !== "US") return null;

  const street1 = buildStreet1(p);
  if (!street1) return null;

  const city = pickCity(p);
  const state = toStateCode(p.state);
  const zip = (p.postcode || "").trim();

  // Need enough to help USPS later: street + (city or ZIP) + state when possible.
  if (!city && !zip) return null;
  if (!city && zip && !state) return null;

  const labelParts = [street1];
  if (city) labelParts.push(city);
  if (state || zip) {
    labelParts.push([state, zip].filter(Boolean).join(" ").trim());
  }
  return {
    label: labelParts.join(", ").trim(),
    street1,
    city: city || "",
    state,
    zip,
    country,
  };
}

const KNOWN_STATE_CODES = new Set(Object.values(US_STATE_NAME_TO_CODE));

/** Prefer rows that match more tokens from the buyer's query (disambiguates e.g. Houston TX vs Houston PA). */
function scoreSuggestion(query: string, s: Suggestion): number {
  const q = query.toLowerCase();
  const tokens = q.split(/\s+/).filter((t) => t.length > 1);
  const hay = `${s.street1} ${s.city} ${s.state} ${s.zip}`.toLowerCase();
  let score = 0;
  for (const t of tokens) {
    if (hay.includes(t)) score += 2;
  }
  // Strong boost when the buyer typed "City, ST" — avoids false positives
  // from two-letter English words (e.g. "or", "in") elsewhere in the string.
  const comma = query.toUpperCase().match(/,\s*([A-Z]{2})(?:\s*$|\s+\d)/);
  if (
    comma &&
    KNOWN_STATE_CODES.has(comma[1]) &&
    comma[1] === s.state
  ) {
    score += 14;
  }
  const zipM = q.match(/\b(\d{5})(?:-\d{4})?\b/);
  if (zipM && s.zip.replace(/\D/g, "").startsWith(zipM[1])) {
    score += 10;
  }
  return score;
}

export async function GET(request: Request) {
  const ip = clientIpFromRequest(request);
  const rl = await rateLimit({
    key: `addr-suggest:${ip}`,
    limit: 60,
    windowSec: 60,
  });
  const blocked = tooManyResponse(rl);
  if (blocked) return blocked;

  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  if (q.length < 3) {
    return NextResponse.json({ suggestions: [] });
  }
  if (q.length > 160) {
    return NextResponse.json({ suggestions: [] });
  }

  // Do not send `bbox`: it biases Photon toward the wrong "Houston" etc. for
  // common street names. We filter to US via countrycode in buildSuggestion.
  const photonUrl = new URL("https://photon.komoot.io/api");
  photonUrl.searchParams.set("q", q);
  photonUrl.searchParams.set("limit", "16");
  photonUrl.searchParams.set("lang", "en");

  try {
    const res = await fetch(photonUrl.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "WristReserveAddressSuggest/1.0 (+https://wristreserve.co)",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(5500),
    });
    if (!res.ok) {
      return NextResponse.json({ suggestions: [] });
    }
    const data = (await res.json()) as PhotonResponse;
    const raw: Suggestion[] = [];
    const seen = new Set<string>();
    for (const feature of data.features ?? []) {
      const s = buildSuggestion(feature.properties);
      if (!s) continue;
      if (seen.has(s.label)) continue;
      seen.add(s.label);
      raw.push(s);
    }
    raw.sort((a, b) => scoreSuggestion(q, b) - scoreSuggestion(q, a));
    return NextResponse.json({ suggestions: raw.slice(0, 5) });
  } catch {
    return NextResponse.json({ suggestions: [] });
  }
}
