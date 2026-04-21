import type { Product } from "@/lib/types";

export interface WatchCategory {
  id: string;
  name: string;
  tagline: string;
  /** Values to ILIKE-match against product name when building variants. */
  keywords: string[];
  /** Full-bleed hero image. */
  heroImage: string;
  /** Small thumbnails shown below (different references / sizes). */
  fallbackVariants: { src: string; label?: string }[];
}

export const WATCH_CATEGORIES: WatchCategory[] = [
  {
    id: "datejust",
    name: "Date Just",
    tagline:
      "The definitive timepiece — classic proportions in 26, 31, 36 and 41mm.",
    keywords: ["datejust", "date just", "date-just"],
    heroImage:
      "https://images.unsplash.com/photo-1509048191080-d2984bad6ae5?auto=format&fit=crop&w=2000&q=85",
    fallbackVariants: [
      {
        src: "https://images.unsplash.com/photo-1509048191080-d2984bad6ae5?auto=format&fit=crop&w=600&q=80",
        label: "26mm",
      },
      {
        src: "https://images.unsplash.com/photo-1523170335258-f5ed11844a49?auto=format&fit=crop&w=600&q=80",
        label: "31mm",
      },
      {
        src: "https://images.unsplash.com/photo-1548171915-e79a380a2a4b?auto=format&fit=crop&w=600&q=80",
        label: "36mm",
      },
      {
        src: "https://images.unsplash.com/photo-1524805444758-089113d48a6d?auto=format&fit=crop&w=600&q=80",
        label: "41mm",
      },
    ],
  },
  {
    id: "submariner",
    name: "Submariner",
    tagline: "The icon of dive — 300m rated, ceramic bezel, integrated presence.",
    keywords: ["submariner", "sub "],
    heroImage:
      "https://images.unsplash.com/photo-1614164185128-e4ec99c436d7?auto=format&fit=crop&w=2000&q=85",
    fallbackVariants: [
      {
        src: "https://images.unsplash.com/photo-1614164185128-e4ec99c436d7?auto=format&fit=crop&w=600&q=80",
        label: "No-Date",
      },
      {
        src: "https://images.unsplash.com/photo-1587836374828-4dbafa94cf0e?auto=format&fit=crop&w=600&q=80",
        label: "Date",
      },
      {
        src: "https://images.unsplash.com/photo-1524592094714-0f0654e20314?auto=format&fit=crop&w=600&q=80",
        label: "Two-Tone",
      },
      {
        src: "https://images.unsplash.com/photo-1547996160-81dfa63595aa?auto=format&fit=crop&w=600&q=80",
        label: "Gold",
      },
    ],
  },
  {
    id: "gmt",
    name: "GMT-Master",
    tagline: "Dual-time travel — Pepsi, Batman, Root Beer and the new Sprite.",
    keywords: ["gmt"],
    heroImage:
      "https://images.unsplash.com/photo-1594534475808-b18fc33b045e?auto=format&fit=crop&w=2000&q=85",
    fallbackVariants: [
      {
        src: "https://images.unsplash.com/photo-1594534475808-b18fc33b045e?auto=format&fit=crop&w=600&q=80",
        label: "Pepsi",
      },
      {
        src: "https://images.unsplash.com/photo-1623998021450-85c29c644e0d?auto=format&fit=crop&w=600&q=80",
        label: "Batman",
      },
      {
        src: "https://images.unsplash.com/photo-1619134778706-7015533a6150?auto=format&fit=crop&w=600&q=80",
        label: "Root Beer",
      },
      {
        src: "https://images.unsplash.com/photo-1606293459339-aa5d34a7b0e1?auto=format&fit=crop&w=600&q=80",
        label: "Sprite",
      },
    ],
  },
  {
    id: "daytona",
    name: "Daytona",
    tagline:
      "The chronograph — tachymeter bezel, racing heritage, vanishingly rare.",
    keywords: ["daytona"],
    heroImage:
      "https://images.unsplash.com/photo-1548171915-e79a380a2a4b?auto=format&fit=crop&w=2000&q=85",
    fallbackVariants: [
      {
        src: "https://images.unsplash.com/photo-1548171915-e79a380a2a4b?auto=format&fit=crop&w=600&q=80",
        label: "Panda",
      },
      {
        src: "https://images.unsplash.com/photo-1587838657229-9ccf97b0f4f4?auto=format&fit=crop&w=600&q=80",
        label: "Reverse",
      },
      {
        src: "https://images.unsplash.com/photo-1555424221-250de2a343ac?auto=format&fit=crop&w=600&q=80",
        label: "Platinum",
      },
      {
        src: "https://images.unsplash.com/photo-1580287212048-8b19a27bd54e?auto=format&fit=crop&w=600&q=80",
        label: "Gold",
      },
    ],
  },
  {
    id: "daydate",
    name: "Day-Date",
    tagline:
      "The President — full gold, fluted bezel, day spelled in full on the dial.",
    keywords: ["day-date", "day date", "daydate", "president"],
    heroImage:
      "https://images.unsplash.com/photo-1527254013938-a08d910d9ff7?auto=format&fit=crop&w=2000&q=85",
    fallbackVariants: [
      {
        src: "https://images.unsplash.com/photo-1527254013938-a08d910d9ff7?auto=format&fit=crop&w=600&q=80",
        label: "36mm",
      },
      {
        src: "https://images.unsplash.com/photo-1547996160-81dfa63595aa?auto=format&fit=crop&w=600&q=80",
        label: "40mm",
      },
      {
        src: "https://images.unsplash.com/photo-1524805444758-089113d48a6d?auto=format&fit=crop&w=600&q=80",
        label: "Yellow Gold",
      },
      {
        src: "https://images.unsplash.com/photo-1509048191080-d2984bad6ae5?auto=format&fit=crop&w=600&q=80",
        label: "White Gold",
      },
    ],
  },
];

export interface HeroCategorySlide {
  id: string;
  name: string;
  tagline: string;
  heroImage: string;
  variants: { src: string; label?: string }[];
  shopHref: string;
  productCount: number;
}

function productMatchesKeywords(product: Product, keywords: string[]): boolean {
  const haystack = `${product.name} ${product.brand ?? ""} ${product.description ?? ""}`.toLowerCase();
  return keywords.some((k) => haystack.includes(k.toLowerCase()));
}

export function buildCategorySlides(products: Product[]): HeroCategorySlide[] {
  return WATCH_CATEGORIES.map((cat) => {
    const matches = products.filter((p) => productMatchesKeywords(p, cat.keywords));
    const productVariants = matches
      .map((p) => {
        const img = (p.media_urls ?? [])[0];
        if (!img) return null;
        return { src: img, label: p.name };
      })
      .filter((v): v is { src: string; label: string } => Boolean(v))
      .slice(0, 4);

    const variants =
      productVariants.length >= 2
        ? [...productVariants, ...cat.fallbackVariants].slice(0, 4)
        : cat.fallbackVariants;

    const heroImage =
      matches.find((p) => p.featured && (p.media_urls ?? [])[0])?.media_urls?.[0] ||
      matches[0]?.media_urls?.[0] ||
      cat.heroImage;

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
