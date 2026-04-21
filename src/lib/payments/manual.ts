export type ManualMethod = "zelle" | "cashapp" | "applecash" | "wire" | "square";

export const MANUAL_METHOD_LABEL: Record<ManualMethod, string> = {
  zelle: "Zelle",
  cashapp: "Cash App",
  applecash: "Apple Cash",
  wire: "Wire / Bank Transfer",
  square: "Card (Square)",
};

export function makeMemoCode(orderId: string): string {
  const clean = orderId.replace(/-/g, "").toUpperCase();
  return `WR-${clean.slice(-6)}`;
}

export function cashAppDeepLink(handle: string, amount: number): string {
  const clean = handle.replace(/^\$/, "");
  return `https://cash.app/$${clean}/${amount.toFixed(2)}`;
}

/**
 * Best-effort appender for Square Checkout links. Many Square links are
 * opaque, so we pass the amount + memo through as query params if the URL
 * looks like it might accept them. If it doesn't, the buyer just enters
 * the amount manually — which matches your current Instagram workflow.
 */
export function squareLinkWithHints(
  baseUrl: string,
  args: { amount: number; memo: string }
): string {
  try {
    const url = new URL(baseUrl);
    // Square's hosted checkout occasionally respects `amount` (in cents) + `note`.
    // Appending won't hurt non-supporting links — they'll just ignore extras.
    if (!url.searchParams.has("amount")) {
      url.searchParams.set("amount", String(Math.round(args.amount * 100)));
    }
    if (!url.searchParams.has("note")) {
      url.searchParams.set("note", args.memo);
    }
    return url.toString();
  } catch {
    return baseUrl;
  }
}
