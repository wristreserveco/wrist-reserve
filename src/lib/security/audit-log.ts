/**
 * Admin audit-log helper.
 *
 * Append-only forensic trail for every administrative action that mutates
 * state. Stored in `public.admin_audit_log` with RLS that allows reads to
 * any authenticated admin and writes only via the service role.
 *
 * Fire-and-forget by design: a failure to write the audit row must never
 * block the user-facing action, so all errors are swallowed + console-
 * logged. We accept the rare write loss in exchange for never breaking
 * checkout or order updates because of an audit log hiccup.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export interface AuditWriteArgs {
  service: SupabaseClient;
  actor:
    | {
        id?: string | null;
        email?: string | null;
      }
    | null;
  ip?: string | null;
  userAgent?: string | null;
  /** Verb-noun string. e.g. "product.update", "order.refund". */
  kind: string;
  /** What kind of thing was acted on. "product" | "order" | "review" | … */
  targetKind?: string;
  /** The row id of the thing acted on. */
  targetId?: string | null;
  /** One-line human-readable summary for admin UIs. */
  message?: string;
  /** Optional structured context — before/after snapshots, amounts, etc. */
  metadata?: Record<string, unknown>;
}

export async function logAuditEvent(args: AuditWriteArgs): Promise<void> {
  try {
    await args.service.from("admin_audit_log").insert({
      actor_id: args.actor?.id ?? null,
      actor_email: args.actor?.email ?? null,
      actor_ip: args.ip ?? null,
      user_agent: args.userAgent ?? null,
      kind: args.kind,
      target_kind: args.targetKind ?? null,
      target_id: args.targetId ?? null,
      message: args.message ?? null,
      metadata: args.metadata ?? {},
    });
  } catch (e) {
    console.error("[audit-log] write failed:", e);
  }
}

/**
 * Pull actor + request context out of a Next.js Route Request and a
 * Supabase auth user. Convenience wrapper for route handlers.
 */
export function auditContextFromRequest(
  request: Request,
  user: { id?: string | null; email?: string | null } | null
) {
  const xff = request.headers.get("x-forwarded-for");
  const cfIp = request.headers.get("cf-connecting-ip");
  const ip =
    cfIp ||
    (xff ? xff.split(",")[0]?.trim() : null) ||
    request.headers.get("x-real-ip") ||
    null;
  return {
    actor: user ? { id: user.id ?? null, email: user.email ?? null } : null,
    ip,
    userAgent: request.headers.get("user-agent") ?? null,
  };
}
