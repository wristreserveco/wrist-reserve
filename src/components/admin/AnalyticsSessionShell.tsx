"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { AnalyticsSessionModal } from "@/components/admin/AnalyticsSessionModal";

function Inner() {
  const sp = useSearchParams();
  const router = useRouter();
  const session = sp.get("session");

  const onClose = () => {
    const next = new URLSearchParams(sp.toString());
    next.delete("session");
    const q = next.toString();
    router.push(q ? `/admin/analytics?${q}` : "/admin/analytics");
  };

  if (!session) return null;
  return <AnalyticsSessionModal publicId={session} onClose={onClose} />;
}

export function AnalyticsSessionShell() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  );
}
