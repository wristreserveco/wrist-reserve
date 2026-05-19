import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { AdminTestimonialsManager } from "@/components/admin/AdminTestimonialsManager";
import type { Testimonial } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AdminTestimonialsPage() {
  const ssr = await createClient();
  const {
    data: { user },
  } = await ssr.auth.getUser();
  if (!user) {
    redirect("/admin/login");
  }

  const supabase = createServiceClient();

  let warning: string | undefined;
  let testimonials: Testimonial[] = [];

  const { data, error } = await supabase
    .from("testimonials")
    .select("*")
    .order("sort_order", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    if (/relation|table .* does not exist/i.test(error.message)) {
      warning =
        "Testimonials table not migrated yet. Run supabase/migrations/022_testimonials.sql in Supabase to enable this section.";
    } else {
      warning = `Could not load testimonials: ${error.message}`;
    }
  } else {
    testimonials = (data ?? []) as Testimonial[];
  }

  // Light product list for the "linked product" select.
  const { data: productRows } = await supabase
    .from("products")
    .select("id, name, brand")
    .order("created_at", { ascending: false })
    .limit(500);

  const productOptions = (productRows ?? []).map((p) => {
    const r = p as { id: string; name: string; brand: string | null };
    return {
      id: r.id,
      label: r.brand ? `${r.brand} — ${r.name}` : r.name,
    };
  });

  return (
    <AdminTestimonialsManager
      initialTestimonials={testimonials}
      initialWarning={warning}
      productOptions={productOptions}
    />
  );
}
