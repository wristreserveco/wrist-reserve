import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

/**
 * Read-only forensic log of every admin mutation. Used to confirm "who did
 * what when" without trusting any UI surface. Rows in this table cannot
 * be edited or deleted (RLS denies UPDATE/DELETE for everyone), so this
 * page renders the raw truth — newest first, 500 rows max.
 */

interface AuditRow {
  id: string;
  created_at: string;
  actor_email: string | null;
  actor_ip: string | null;
  user_agent: string | null;
  kind: string;
  target_kind: string | null;
  target_id: string | null;
  message: string | null;
  metadata: Record<string, unknown> | null;
}

export default async function AdminAuditPage() {
  const ssr = await createClient();
  const {
    data: { user },
  } = await ssr.auth.getUser();
  if (!user) redirect("/admin/login");

  const supabase = createServiceClient();
  let rows: AuditRow[] = [];
  let warning: string | null = null;

  const { data, error } = await supabase
    .from("admin_audit_log")
    .select(
      "id, created_at, actor_email, actor_ip, user_agent, kind, target_kind, target_id, message, metadata"
    )
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    if (/relation|table .* does not exist/i.test(error.message)) {
      warning =
        "Audit log table not migrated yet. Run supabase/migrations/023_admin_audit_log.sql in Supabase to enable this page.";
    } else {
      warning = `Could not load audit log: ${error.message}`;
    }
  } else {
    rows = (data ?? []) as AuditRow[];
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-[0.28em] text-white/35">
            Security
          </p>
          <h1 className="font-display text-3xl text-white">Audit log</h1>
          <p className="mt-1 text-xs text-white/45">
            Every admin mutation. Append-only — nothing here can be edited or
            deleted, even by admins.
          </p>
        </div>
      </div>

      {warning ? (
        <div className="rounded-sm border border-yellow-500/30 bg-yellow-500/5 px-4 py-3 text-xs text-yellow-200">
          {warning}
        </div>
      ) : null}

      {!warning && rows.length === 0 ? (
        <p className="rounded-sm border border-white/10 bg-black/40 px-4 py-6 text-center text-sm text-white/55">
          No admin actions recorded yet.
        </p>
      ) : null}

      {rows.length > 0 ? (
        <div className="space-y-2">
          {rows.map((row) => (
            <div
              key={row.id}
              className="rounded-sm border border-white/10 bg-black/40 px-4 py-3"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="flex items-baseline gap-2">
                  <span className="rounded-sm bg-white/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-white/80">
                    {row.kind}
                  </span>
                  {row.target_kind && row.target_id ? (
                    <span className="font-mono text-[10px] text-white/40">
                      {row.target_kind}:{row.target_id.slice(0, 8)}
                    </span>
                  ) : null}
                </div>
                <span className="text-[10px] uppercase tracking-[0.15em] text-white/40">
                  {new Date(row.created_at).toLocaleString()}
                </span>
              </div>
              {row.message ? (
                <p className="mt-2 text-sm text-white/80">{row.message}</p>
              ) : null}
              <div className="mt-2 flex flex-wrap items-center gap-3 text-[10px] text-white/40">
                <span>{row.actor_email ?? "(unknown actor)"}</span>
                {row.actor_ip ? <span>· {row.actor_ip}</span> : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
