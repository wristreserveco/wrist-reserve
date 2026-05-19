/**
 * Build a public tracking URL from a (carrier, tracking number) pair.
 * Returns null if we don't recognize the carrier — caller can fall back to
 * showing the bare tracking number to the buyer.
 */
export function buildTrackingUrl(
  carrier: string | null | undefined,
  trackingNumber: string | null | undefined
): string | null {
  if (!carrier || !trackingNumber) return null;
  const c = carrier.trim().toLowerCase();
  const t = encodeURIComponent(trackingNumber.trim());
  if (!t) return null;

  if (c.includes("usps")) {
    return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${t}`;
  }
  if (c.includes("ups")) {
    return `https://www.ups.com/track?loc=en_US&tracknum=${t}`;
  }
  if (c.includes("fedex")) {
    return `https://www.fedex.com/fedextrack/?trknbr=${t}`;
  }
  if (c.includes("dhl")) {
    return `https://www.dhl.com/us-en/home/tracking.html?tracking-id=${t}`;
  }
  return null;
}

/** Friendly display name for a carrier slug ("usps" → "USPS"). */
export function carrierLabel(carrier: string | null | undefined): string {
  if (!carrier) return "Carrier";
  const c = carrier.trim();
  const lower = c.toLowerCase();
  if (lower.includes("usps")) return "USPS";
  if (lower.includes("ups")) return "UPS";
  if (lower.includes("fedex")) return "FedEx";
  if (lower.includes("dhl")) return "DHL";
  return c;
}
