import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductGallery } from "@/components/ProductGallery";
import { ProductPurchaseBlock } from "@/components/ProductPurchaseBlock";
import { TrustBadges } from "@/components/TrustBadges";
import { ProductReviews } from "@/components/ProductReviews";
import { createClient } from "@/lib/supabase/server";
import {
  isSupabaseConfigured,
  isStripeConfigured,
  isCryptoConfigured,
  isManualPaymentConfigured,
  getManualPaymentConfig,
} from "@/lib/env";
import { formatPrice, mapProduct, parseMediaUrls } from "@/lib/products";

export const dynamic = "force-dynamic";

interface Props {
  params: { id: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  if (!isSupabaseConfigured()) {
    return { title: "Product | Wrist Reserve" };
  }
  const supabase = await createClient();
  const { data } = await supabase.from("products").select("name").eq("id", params.id).single();
  if (!data?.name) return { title: "Product | Wrist Reserve" };
  return { title: `${data.name} | Wrist Reserve` };
}

export default async function ProductPage({ params }: Props) {
  if (!isSupabaseConfigured()) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-24 text-center">
        <p className="text-white/55">Configure Supabase to view product pages.</p>
        <Link href="/shop" className="mt-6 inline-block text-sm text-gold-300 underline-offset-4 hover:underline">
          Back to shop
        </Link>
      </div>
    );
  }

  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from("products")
    .select("*")
    .eq("id", params.id)
    .single();

  if (error || !row) {
    notFound();
  }

  const product = mapProduct(row as Record<string, unknown>);
  const images = parseMediaUrls(product.media_urls);
  const sold = product.status === "sold";

  const availableRails: ("crypto" | "manual" | "stripe")[] = [];
  if (isCryptoConfigured()) availableRails.push("crypto");
  if (isManualPaymentConfigured()) availableRails.push("manual");
  if (isStripeConfigured()) availableRails.push("stripe");
  const manualMethods = getManualPaymentConfig().enabled;

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
        <ProductGallery
          images={images}
          videoUrl={product.video_url}
          videoTrimStart={product.video_trim_start}
          videoTrimEnd={product.video_trim_end}
          videoPosterUrl={product.video_poster_url}
          name={product.name}
        />

        <div>
          {product.brand || product.model ? (
            <p className="text-xs uppercase tracking-[0.3em] text-white/40">
              {[product.brand, product.model].filter(Boolean).join(" · ")}
            </p>
          ) : null}
          <h1 className="mt-3 font-display text-4xl text-white sm:text-5xl">{product.name}</h1>
          <div className="mt-6 flex flex-wrap items-center gap-4">
            <p className="font-display text-3xl text-white">{formatPrice(product.price)}</p>
            {sold || product.quantity <= 0 ? (
              <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-white/70">
                Sold
              </span>
            ) : product.quantity === 1 ? (
              <span className="rounded-full border border-amber-400/50 bg-amber-400/10 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-amber-200">
                Last one — act fast
              </span>
            ) : product.quantity <= 3 ? (
              <span className="rounded-full border border-amber-400/35 bg-amber-400/10 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-amber-200">
                Only {product.quantity} left
              </span>
            ) : (
              <span className="rounded-full border border-gold-500/35 bg-gold-500/10 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-gold-200">
                {product.quantity} in stock
              </span>
            )}
          </div>

          {product.description ? (
            <div className="prose prose-invert prose-sm mt-10 max-w-none text-white/65">
              {product.description.split("\n").map((line, i) => (
                <p key={i} className="mb-3 last:mb-0">
                  {line}
                </p>
              ))}
            </div>
          ) : (
            <p className="mt-10 text-sm text-white/45">Details available on request.</p>
          )}

          <ProductPurchaseBlock
            product={product}
            availableRails={availableRails}
            manualMethods={manualMethods}
          />

          <TrustBadges />
        </div>
      </div>

      <ProductReviews />
    </div>
  );
}
