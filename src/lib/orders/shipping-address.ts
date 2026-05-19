/**
 * Detects placeholder copy we store on `orders.shipping_address` before the
 * buyer completes PayPal (pay-first flow). Real addresses must not match this.
 */
export function hasConcreteShippingAddress(text: unknown): boolean {
  if (typeof text !== "string") return false;
  const t = text.trim();
  if (!t) return false;
  const lower = t.toLowerCase();
  if (lower.includes("ship-to will be taken from paypal")) return false;
  if (lower.includes("collecting via paypal at checkout")) return false;
  return true;
}
