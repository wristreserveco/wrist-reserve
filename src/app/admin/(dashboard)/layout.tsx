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
    // Sidebar handles its own positioning across breakpoints:
    //  - mobile: sticky top bar + slide-in drawer
    //  - md+:    sticky 224px column on the left
    // The main content sits in a flex sibling so md+ shows them side-by-
    // side; on mobile the sidebar is `fixed` (drawer) so the content
    // takes the full width naturally.
    <div className="min-h-screen bg-black text-white md:flex">
      <AdminSidebar />
      <div className="min-w-0 flex-1 overflow-x-hidden">
        <div className="mx-auto max-w-6xl px-3 py-6 sm:px-6 sm:py-10">
          {children}
        </div>
      </div>
      <AdminAlerts />
    </div>
  );
}
