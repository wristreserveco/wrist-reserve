import type { SupabaseClient } from "@supabase/supabase-js";

export type OrderEventKind =
  | "created"
  | "buyer_details"
  | "buyer_claimed_payment"
  | "proof_uploaded"
  | "verified"
  | "marked_paid"
  | "shipped"
  | "tracking_updated"
  | "cancelled"
  | "refunded"
  | "expired"
  | "note_added";

export type OrderEventActor = "system" | "buyer" | "admin";

export interface OrderEventRow {
  id: string;
  order_id: string;
  kind: OrderEventKind;
  message: string | null;
  actor: OrderEventActor;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

/**
 * Append an immutable event to the order audit log.
 * Silent no-op if the `order_events` table hasn't been migrated yet —
 * we never want audit-logging to block a real business action.
 */
export async function logOrderEvent(
  supabase: SupabaseClient,
  args: {
    orderId: string;
    kind: OrderEventKind;
    message?: string;
    actor?: OrderEventActor;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  try {
    const { error } = await supabase.from("order_events").insert({
      order_id: args.orderId,
      kind: args.kind,
      message: args.message ?? null,
      actor: args.actor ?? "system",
      metadata: args.metadata ?? null,
    });
    if (error && !/relation .* does not exist/i.test(error.message)) {
      console.error("[order_events] insert failed", error.message);
    }
  } catch (err) {
    console.error("[order_events] unexpected", err);
  }
}

export function formatEvent(kind: OrderEventKind): { label: string; icon: string } {
  switch (kind) {
    case "created":
      return { label: "Order placed", icon: "•" };
    case "buyer_details":
      return { label: "Buyer details received", icon: "✎" };
    case "buyer_claimed_payment":
      return { label: "Buyer confirmed send", icon: "→" };
    case "proof_uploaded":
      return { label: "Payment proof uploaded", icon: "📎" };
    case "verified":
      return { label: "Payment verified", icon: "✓" };
    case "marked_paid":
      return { label: "Marked paid", icon: "$" };
    case "shipped":
      return { label: "Shipped", icon: "✈" };
    case "tracking_updated":
      return { label: "Tracking updated", icon: "◎" };
    case "cancelled":
      return { label: "Cancelled", icon: "×" };
    case "refunded":
      return { label: "Refunded", icon: "↺" };
    case "expired":
      return { label: "Expired", icon: "⏳" };
    case "note_added":
      return { label: "Admin note", icon: "✎" };
    default:
      return { label: kind, icon: "•" };
  }
}
