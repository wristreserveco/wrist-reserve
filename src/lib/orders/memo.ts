/**
 * Short, human-readable memo derived from an order id.
 *
 * Used as a public-facing reference (e.g. WR-A1B2C3) on order detail,
 * shipping label notes, admin tables, etc. Stable + URL-safe.
 */
export function makeMemoCode(orderId: string): string {
  const clean = orderId.replace(/-/g, "").toUpperCase();
  return `WR-${clean.slice(-6)}`;
}
