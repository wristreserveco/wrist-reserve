import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductGallery } from "@/components/ProductGallery";
import { ProductPurchaseBlock } from "@/components/ProductPurchaseBlock";
import { ProductShareButton } from "@/components/ProductShareButton";
import { TrustBadges } from "@/components/TrustBadges";
import { ProductReviews } from "@/components/ProductReviews";
import { createClient } from "@/lib/supabase/server";
import {
  isSupabaseConfigured,
  isCryptoConfigured,
  isPaypalConfigured,
} from "@/lib/env";
import type { Rail } from "@/components/PaymentMethodModal";
import { formatPrice, mapProduct, parseMediaUrls } from "@/lib/products";
import { TIER_META } from "@/lib/tiers";

export const dynamic = "force-dynamic";

interface Props {
  params: { id: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  if (!isSupabaseConfigured()) {
    return { title: "Product" };
  }
  const supabase = await createClient();
  const { data } = await supabase
    .from("products")
    .select("name, brand, model, price, description, media_urls, hidden")
    .eq("id", params.id)
    .single();
  if (!data?.name || data.hidden === true) {
    return { title: "Product" };
  }

  const subject = [data.brand, data.model].filter(Boolean).join(" ");
  const title = subject ? `${data.name} — ${subject}` : data.name;
  const description = data.description
    ? String(data.description).split("\n")[0].slice(0, 220)
    : `Authenticated ${subject || "luxury timepiece"} from Wrist Reserve — affordable, insured worldwide shipping.`;
  const images = parseMediaUrls(data.media_urls);

  return {
    title,
    description,
    openGraph: {
      type: "website", // schema.org "product" is not in next/Metadata's union
      title,
      description,
      images: images.slice(0, 4).map((url) => ({ url })),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: images[0] ? [images[0]] : undefined,
    },
  };
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
  if (product.hidden) {
    notFound();
  }
  const images = parseMediaUrls(product.media_urls);
  const sold = product.status === "sold";

  // Load approved reviews; if the reviews table isn't migrated yet, silently
  // fall back to an empty list so the page still renders.
  let reviews: import("@/lib/types").ProductReview[] = [];
  try {
    const { data: reviewRows, error: reviewErr } = await supabase
      .from("product_reviews")
      .select("*")
      .eq("product_id", product.id)
      .eq("approved", true)
      .order("created_at", { ascending: false })
      .limit(60);
    if (!reviewErr && reviewRows) {
      reviews = reviewRows as import("@/lib/types").ProductReview[];
    }
  } catch {
    // Table doesn't exist yet — fine.
  }

  // Order matters: PayPal first (preferred for buyer trust + protection),
  // crypto second. The modal renders these in the order we provide.
  const availableRails: Rail[] = [];
  if (isPaypalConfigured()) availableRails.push("paypal");
  if (isCryptoConfigured()) availableRails.push("crypto");

  // Product JSON-LD — populates Google Shopping cards, share-link previews,
  // and AI assistants with structured pricing/availability/brand data.
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "";
  const productJsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description:
      product.description?.split("\n")[0]?.slice(0, 500) ||
      `Authenticated ${[product.brand, product.model].filter(Boolean).join(" ")} from Wrist Reserve.`,
    sku: product.id,
    image: images,
    ...(product.brand
      ? { brand: { "@type": "Brand", name: product.brand } }
      : {}),
    ...(product.model ? { model: product.model } : {}),
    offers: {
      "@type": "Offer",
      url: `${siteUrl}/products/${product.id}`,
      price: product.price.toFixed(2),
      priceCurrency: "USD",
      availability: sold
        ? "https://schema.org/SoldOut"
        : product.quantity > 0
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
      itemCondition: "https://schema.org/UsedCondition",
      seller: { "@type": "Organization", name: "Wrist Reserve" },
    },
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }}
      />
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
          {product.brand || product.model || product.tier === "super_tier" ? (
            <p className="text-xs uppercase tracking-[0.3em]">
              {product.tier === "super_tier" ? (
                <>
                  <span className="text-gold-200/95">{TIER_META.super_tier.label}</span>
                  {product.brand || product.model ? (
                    <>
                      <span className="text-white/25"> · </span>
                      <span className="text-white/40">
                        {[product.brand, product.model].filter(Boolean).join(" · ")}
                      </span>
                    </>
                  ) : null}
                </>
              ) : (
                <span className="text-white/40">
                  {[product.brand, product.model].filter(Boolean).join(" · ")}
                </span>
              )}
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
            <h1 className="font-display text-4xl text-white sm:text-5xl">{product.name}</h1>
            <ProductShareButton productName={product.name} />
          </div>
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
          />

          <TrustBadges />
        </div>
      </div>

      <ProductReviews productId={product.id} initialReviews={reviews} />
    </div>
  );
}
