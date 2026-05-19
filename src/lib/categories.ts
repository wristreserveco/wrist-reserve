import type { Product } from "@/lib/types";

/**
 * Wikimedia Commons Rolex photography (same sourcing approach as category tiles).
 * Fallback hero tiles link into shop search; live inventory replaces these when
 * enough products match keywords.
 */
export interface WatchCategory {
  id: string;
  name: string;
  tagline: string;
  /** Values to ILIKE-match against product name when building variants. */
  keywords: string[];
  /** Full-bleed hero image. */
  heroImage: string;
  /** Small thumbnails — each must link somewhere shoppable. */
  fallbackVariants: { src: string; label?: string; href: string }[];
}

const DJ = "https://upload.wikimedia.org/wikipedia/commons/8/81/Rolex_Datejust_126234.jpg";
const SUB = "https://upload.wikimedia.org/wikipedia/commons/c/cd/Rolex-Submariner.jpg";
const SEA = "https://upload.wikimedia.org/wikipedia/commons/8/80/Rolex_Sea_Dweller_16600.jpg";
const YM = "https://upload.wikimedia.org/wikipedia/commons/thumb/2/28/Rolex_Yachtmaster_II_116680.JPG/1280px-Rolex_Yachtmaster_II_116680.JPG";
const GMT = "https://upload.wikimedia.org/wikipedia/commons/8/85/Rolex_GMT_Master_II_-_16710_%28without_background%2C_cropped_to_casing%29.jpg";
const DEEP = "https://upload.wikimedia.org/wikipedia/commons/thumb/0/0c/Rolex_Deepsea_Sea-Dweller_116660_Blue_Dial_%27James_Cameron%27.jpg/1280px-Rolex_Deepsea_Sea-Dweller_116660_Blue_Dial_%27James_Cameron%27.jpg";
const SKY = "https://upload.wikimedia.org/wikipedia/commons/thumb/1/13/Rolex_Sky-Dweller_in_oro_bianco.jpg/1280px-Rolex_Sky-Dweller_in_oro_bianco.jpg";
const EXPLORER = "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3f/Rolex_Explorer_II_%28edited%29.jpg/1280px-Rolex_Explorer_II_%28edited%29.jpg";
const MILGAUSS = "https://upload.wikimedia.org/wikipedia/commons/8/88/Rolex_Milgauss_116400GV.jpg";
const DAYTONA = "https://upload.wikimedia.org/wikipedia/commons/5/5b/Daytona116509.jpg";
const DAYDATE =
  "https://upload.wikimedia.org/wikipedia/commons/0/03/Rolex-day-date-champagne-dial-18k-yellow-gold-president-automatic-men_s-watch-118238cdp.webp";

function shop(q: string): string {
  return `/shop?q=${encodeURIComponent(q)}`;
}

export const WATCH_CATEGORIES: WatchCategory[] = [
  {
    id: "datejust",
    name: "Datejust",
    tagline:
      "The definitive timepiece — classic proportions in 26, 31, 36 and 41mm.",
    keywords: ["datejust", "date just", "date-just"],
    heroImage: DJ,
    fallbackVariants: [
      { src: DJ, label: "26mm", href: shop("Rolex Datejust 26mm") },
      { src: DJ, label: "31mm", href: shop("Rolex Datejust 31mm") },
      { src: DJ, label: "36mm", href: shop("Rolex Datejust 36mm") },
      { src: DJ, label: "41mm", href: shop("Rolex Datejust 41mm") },
    ],
  },
  {
    id: "submariner",
    name: "Submariner",
    tagline: "The icon of dive — 300m rated, ceramic bezel, integrated presence.",
    keywords: ["submariner", "sub "],
    heroImage: SUB,
    fallbackVariants: [
      { src: SUB, label: "No-Date", href: shop("Rolex Submariner no date") },
      { src: SEA, label: "Date", href: shop("Rolex Submariner date") },
      { src: YM, label: "Two-Tone", href: shop("Rolex Submariner two tone") },
      { src: DAYDATE, label: "Gold", href: shop("Rolex Submariner gold") },
    ],
  },
  {
    id: "gmt",
    name: "GMT-Master",
    tagline: "Dual-time travel — Pepsi, Batman, Root Beer and the new Sprite.",
    keywords: ["gmt"],
    heroImage: GMT,
    fallbackVariants: [
      { src: GMT, label: "Pepsi", href: shop("Rolex GMT-Master II Pepsi") },
      { src: DEEP, label: "Batman", href: shop("Rolex GMT-Master II Batman") },
      { src: SKY, label: "Root Beer", href: shop("Rolex GMT-Master II root beer") },
      { src: MILGAUSS, label: "Sprite", href: shop("Rolex GMT-Master II Sprite") },
    ],
  },
  {
    id: "daytona",
    name: "Daytona",
    tagline:
      "The chronograph — tachymeter bezel, racing heritage, vanishingly rare.",
    keywords: ["daytona"],
    heroImage: DAYTONA,
    fallbackVariants: [
      { src: DAYTONA, label: "Panda", href: shop("Rolex Daytona panda") },
      { src: DAYTONA, label: "Reverse", href: shop("Rolex Daytona reverse panda") },
      { src: EXPLORER, label: "Platinum", href: shop("Rolex Daytona platinum") },
      { src: DAYDATE, label: "Gold", href: shop("Rolex Daytona gold") },
    ],
  },
  {
    id: "daydate",
    name: "Day-Date",
    tagline:
      "The President — full gold, fluted bezel, day spelled in full on the dial.",
    keywords: ["day-date", "day date", "daydate", "president"],
    heroImage: DAYDATE,
    fallbackVariants: [
      { src: DAYDATE, label: "36mm", href: shop("Rolex Day-Date 36") },
      { src: DAYDATE, label: "40mm", href: shop("Rolex Day-Date 40") },
      { src: DJ, label: "Yellow Gold", href: shop("Rolex Day-Date yellow gold") },
      { src: DJ, label: "White Gold", href: shop("Rolex Day-Date white gold") },
    ],
  },
];

export interface HeroVariant {
  src: string;
  label?: string;
  href: string;
}

export interface HeroCategorySlide {
  id: string;
  name: string;
  tagline: string;
  heroImage: string;
  variants: HeroVariant[];
  shopHref: string;
  productCount: number;
}

function productMatchesKeywords(product: Product, keywords: string[]): boolean {
  const haystack = `${product.name} ${product.brand ?? ""} ${product.description ?? ""}`.toLowerCase();
  return keywords.some((k) => haystack.includes(k.toLowerCase()));
}

/**
 * Pull a representative still image for a product, preferring real product
 * photos but falling back to the auto-generated video poster when the
 * admin only uploaded a wrist video. Returns null when nothing visual is
 * available — caller can skip the product or fall back to stock art.
 */
function productCoverImage(p: Product): string | null {
  const first = (p.media_urls ?? [])[0];
  if (first) return first;
  if (p.video_poster_url) return p.video_poster_url;
  return null;
}

export function buildCategorySlides(products: Product[]): HeroCategorySlide[] {
  return WATCH_CATEGORIES.map((cat) => {
    // Super Tier is its own funnel (shop toggle + homepage spotlight). Collection
    // heroes are the "main line" — don't mix premium-tier inventory into Datejust etc.
    const matches = products.filter(
      (p) =>
        p.tier !== "super_tier" && productMatchesKeywords(p, cat.keywords)
    );

    // Build variant tiles from real products first. We accept either a
    // proper photo (media_urls[0]) or the auto-generated video poster — that
    // way collections where the user only uploaded videos still show their
    // actual inventory instead of falling back to Wikipedia stock art.
    const productVariants: HeroVariant[] = [];
    const seen = new Set<string>();
    for (const p of matches) {
      const img = productCoverImage(p);
      if (!img || seen.has(img)) continue;
      seen.add(img);
      productVariants.push({
        src: img,
        label: p.name,
        href: `/products/${p.id}`,
      });
      if (productVariants.length >= 4) break;
    }

    // Prefer 4 real product tiles. If we have fewer, top up with stock
    // fallbacks so the row never looks empty. A single real tile is enough
    // to anchor the row in actual inventory.
    const variants: HeroVariant[] =
      productVariants.length >= 4
        ? productVariants
        : productVariants.length >= 1
        ? [...productVariants, ...cat.fallbackVariants].slice(0, 4)
        : cat.fallbackVariants;

    // Hero backdrop: also prefer a real product cover (photo or video
    // poster) over the stock Wikipedia image.
    const heroImage =
      productCoverImage(
        matches.find((p) => p.featured) ?? matches[0] ?? ({} as Product)
      ) || cat.heroImage;

    return {
      id: cat.id,
      name: cat.name,
      tagline: cat.tagline,
      heroImage,
      variants,
      shopHref: `/shop?q=${encodeURIComponent(cat.keywords[0])}`,
      productCount: matches.length,
    };
  });
}
