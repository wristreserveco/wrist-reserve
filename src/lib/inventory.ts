import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Decrement stock for a product when an order is marked paid.
 * Falls back gracefully if the `quantity` column hasn't been migrated yet —
 * in that case it just flips status to "sold".
 */
export async function decrementProductStock(
  supabase: SupabaseClient,
  productId: string
): Promise<void> {
  const { data: prod } = await supabase
    .from("products")
    .select("quantity, status")
    .eq("id", productId)
    .single();

  const currentQty =
    prod && typeof prod.quantity === "number" ? prod.quantity : null;

  if (currentQty !== null) {
    const nextQty = Math.max(0, currentQty - 1);
    await supabase
      .from("products")
      .update({
        quantity: nextQty,
        status: nextQty === 0 ? "sold" : "available",
      })
      .eq("id", productId);
  } else {
    await supabase
      .from("products")
      .update({ status: "sold" })
      .eq("id", productId);
  }
}
