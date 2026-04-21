// Two-tier catalog model.
//
// Internal reality: one line is the everyday catalog, the other is the
// premium one. On the DB we use two neutral keys — `classic` (default) and
// `super_tier` (premium) — so we never have to write a migration just to
// re-brand the display text. Change the strings below if you want to
// reshape the public language.
//
//   - `classic`     → default / everyday. **Never shown to customers** — only
//     used in admin where we need *some* word to distinguish the two.
//   - `super_tier`  → the premium, advertised line. This is what customers see.
//
// DB column: products.tier (text, constrained to the keys below via
// migration 013). Legacy data tagged `reserve` is transparently upgraded
// to `super_tier` by `normaliseTier` below, so the app stays functional
// even if the migration hasn't been applied yet.

export type ProductTier = "classic" | "super_tier";

export const PRODUCT_TIERS: ProductTier[] = ["classic", "super_tier"];

export const DEFAULT_TIER: ProductTier = "classic";

export interface TierMeta {
  /** DB value + URL slug. */
  key: ProductTier;
  /** Short display label (chips, badges, nav). */
  label: string;
  /** Plural/marketing form for sections and hero slides. */
  plural: string;
  /** One-line poetic subtitle used in hero / collection cards. */
  tagline: string;
  /** Longer editorial copy for the tier's landing section. */
  blurb: string;
  /**
   * If `false`, this tier is never advertised or shown as a filter on the
   * storefront — it only exists in admin UIs as an organisational label.
   * We use this for the default tier so customers don't see "Standard" /
   * "Classic" chips next to the premium line.
   */
  publiclyAdvertised: boolean;
}

export const TIER_META: Record<ProductTier, TierMeta> = {
  classic: {
    key: "classic",
    // Internal label only — customers never see this word. We use "Standard"
    // so the admin dropdown has *something* readable for non-Super-Tier items.
    label: "Standard",
    plural: "Standard catalog",
    tagline: "The everyday catalog",
    blurb:
      "Our everyday catalog. Concierge-grade presentation, authenticated in-house, shipped worldwide.",
    publiclyAdvertised: false,
  },
  super_tier: {
    key: "super_tier",
    label: "Super Tier",
    plural: "Super Tier",
    tagline: "The ceiling of the catalog. No shortcuts.",
    blurb:
      "Our most obsessively executed pieces — weight, finish, hand-feel, movement spec'd to the reference down to the last detail. Reserved for collectors who refuse to compromise.",
    publiclyAdvertised: true,
  },
};

/**
 * Tiers the storefront is allowed to mention: hero promos, shop filters,
 * URL params. Keep this derived so re-flagging `publiclyAdvertised` on
 * `classic` (if you ever want to) would propagate everywhere.
 */
export const PUBLIC_TIERS: ProductTier[] = PRODUCT_TIERS.filter(
  (t) => TIER_META[t].publiclyAdvertised
);

/**
 * Normalise any incoming tier-ish value (DB row, URL param, user input) to
 * a valid {@link ProductTier}. Legacy `"reserve"` values are treated as
 * `"super_tier"` so the app keeps working if DB migration 013 hasn't been
 * applied yet or if an old share link is hit.
 */
export function normaliseTier(v: unknown): ProductTier {
  if (v === "super_tier" || v === "reserve") return "super_tier";
  return "classic";
}
