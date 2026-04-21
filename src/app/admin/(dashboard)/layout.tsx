import dynamic from "next/dynamic";
import { AdminSidebar } from "@/components/AdminSidebar";

/** Client-only: uses framer-motion. SSR was resolving missing vendor chunks (motion-dom) and breaking admin + CSS. */
const AdminAlerts = dynamic(
  () =>
    import("@/components/admin/AdminAlerts").then((m) => ({
      default: m.AdminAlerts,
    })),
  { ssr: false }
);

export default function AdminDashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-black text-white">
      <AdminSidebar />
      <div className="flex-1 overflow-auto">
        <div className="mx-auto max-w-6xl px-6 py-10">{children}</div>
      </div>
      <AdminAlerts />
    </div>
  );
}
