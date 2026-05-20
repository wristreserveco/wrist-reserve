import type { Product } from "@/lib/types";

const C = "https://upload.wikimedia.org/wikipedia/commons";

/** Polished product-style shots (Commons + one Unsplash). No Richard Mille hero art. */
export const BRAND_STOCK_COVERS: Record<string, string> = {
  rolex: `${C}/c/cd/Rolex-Submariner.jpg`,
  "audemars-piguet": `${C}/thumb/0/05/Audemars_Piguet_Royal_Oak_ref._15202.jpg/1280px-Audemars_Piguet_Royal_Oak_ref._15202.jpg`,
  "patek-philippe": `${C}/7/74/Patek-Philippe-Nautilus-5711.jpg`,
  omega: `${C}/c/cd/Vintage_Omega_Speedmaster_%22Pre-moon%22.jpg`,
  cartier: `${C}/d/df/Cartier_Tank.jpg`,
  tudor: `${C}/thumb/8/86/Tudor_Pelagos_for_Carolina_Watch_Club_on_Wrist.jpg/1280px-Tudor_Pelagos_for_Carolina_Watch_Club_on_Wrist.jpg`,
  iwc: `${C}/thumb/e/e8/IWC_Portuguese_Automatic_%28cropped%29.JPG/1280px-IWC_Portuguese_Automatic_%28cropped%29.JPG`,
  breitling: `${C}/thumb/6/6a/Breitling_Navitimer-P5200001-black.jpg/1280px-Breitling_Navitimer-P5200001-black.jpg`,
  "tag-heuer":
    "https://images.unsplash.com/photo-1518546305927-5a555bb7020d?w=1200&q=85&auto=format&fit=crop",
  "vacheron-constantin": `${C}/thumb/0/05/Audemars_Piguet_Royal_Oak_ref._15202.jpg/1280px-Audemars_Piguet_Royal_Oak_ref._15202.jpg`,
  "grand-seiko": `${C}/c/cd/Vintage_Omega_Speedmaster_%22Pre-moon%22.jpg`,
  panerai: `${C}/8/80/Rolex_Sea_Dweller_16600.jpg`,
  "a-lange-sohne": `${C}/0/0b/Calatrava1.jpg`,
  "jaeger-lecoultre": `${C}/0/0b/Calatrava1.jpg`,
  zenith: `${C}/5/5b/Daytona116509.jpg`,
  /** Big Bang–style sport chronograph on black — not the RM wiki tile. */
  hublot: `${C}/thumb/6/6a/Tissot_chronograph_watch_on_black_background.jpg/1280px-Tissot_chronograph_watch_on_black_background.jpg`,
  /** If you stock RM, show a sporty luxury chrono — not skeleton RM press art. */
  "richard-mille": `${C}/1/1e/Audemars_Piguet_Royal_Oak_Offshore_Diver.jpg`,
};

/** Match inventory names/descriptions → model photo closest to what you listed. */
const MODEL_STOCK_RULES: { keywords: string[]; cover: string }[] = [
  {
    keywords: ["big bang", "unico", "spirit of big bang", "aerofusion"],
    cover: BRAND_STOCK_COVERS.hublot!,
  },
  { keywords: ["classic fusion"], cover: BRAND_STOCK_COVERS.hublot! },
  { keywords: ["submariner", "sub "], cover: `${C}/c/cd/Rolex-Submariner.jpg` },
  { keywords: ["daytona"], cover: `${C}/5/5b/Daytona116509.jpg` },
  { keywords: ["gmt"], cover: `${C}/8/85/Rolex_GMT_Master_II_-_16710_%28without_background%2C_cropped_to_casing%29.jpg` },
  { keywords: ["datejust", "date just"], cover: `${C}/8/81/Rolex_Datejust_126234.jpg` },
  {
    keywords: ["day-date", "day date", "president"],
    cover: `${C}/0/03/Rolex-day-date-champagne-dial-18k-yellow-gold-president-automatic-men_s-watch-118238cdp.webp`,
  },
  { keywords: ["sea-dweller", "seadweller"], cover: `${C}/8/80/Rolex_Sea_Dweller_16600.jpg` },
  {
    keywords: ["deepsea", "deep sea"],
    cover: `${C}/thumb/0/0c/Rolex_Deepsea_Sea-Dweller_116660_Blue_Dial_%27James_Cameron%27.jpg/1280px-Rolex_Deepsea_Sea-Dweller_116660_Blue_Dial_%27James_Cameron%27.jpg`,
  },
  { keywords: ["yacht-master", "yachtmaster"], cover: `${C}/thumb/2/28/Rolex_Yachtmaster_II_116680.JPG/1280px-Rolex_Yachtmaster_II_116680.JPG` },
  { keywords: ["explorer"], cover: `${C}/thumb/3/3f/Rolex_Explorer_II_%28edited%29.jpg/1280px-Rolex_Explorer_II_%28edited%29.jpg` },
  { keywords: ["milgauss"], cover: `${C}/8/88/Rolex_Milgauss_116400GV.jpg` },
  { keywords: ["sky-dweller", "sky dweller"], cover: `${C}/thumb/1/13/Rolex_Sky-Dweller_in_oro_bianco.jpg/1280px-Rolex_Sky-Dweller_in_oro_bianco.jpg` },
  { keywords: ["nautilus"], cover: `${C}/7/74/Patek-Philippe-Nautilus-5711.jpg` },
  {
    keywords: ["aquanaut"],
    cover: `${C}/thumb/6/67/Patek_Philippe_Aquanaut_Advanced_Research_ref._5650G_limitato_a_500_pezzi.jpg/1280px-Patek_Philippe_Aquanaut_Advanced_Research_ref._5650G_limitato_a_500_pezzi.jpg`,
  },
  { keywords: ["calatrava"], cover: `${C}/0/0b/Calatrava1.jpg` },
  { keywords: ["royal oak offshore", "offshore"], cover: `${C}/1/1e/Audemars_Piguet_Royal_Oak_Offshore_Diver.jpg` },
  {
    keywords: ["royal oak"],
    cover: `${C}/thumb/0/05/Audemars_Piguet_Royal_Oak_ref._15202.jpg/1280px-Audemars_Piguet_Royal_Oak_ref._15202.jpg`,
  },
  { keywords: ["speedmaster", "moonwatch"], cover: `${C}/c/cd/Vintage_Omega_Speedmaster_%22Pre-moon%22.jpg` },
  { keywords: ["seamaster"], cover: `${C}/4/46/Omega_Seamaster_Co-Axial.jpg` },
  { keywords: ["santos"], cover: `${C}/f/fe/Cartier_Santos.jpg` },
  { keywords: ["tank"], cover: `${C}/d/df/Cartier_Tank.jpg` },
  { keywords: ["panthere", "panthère"], cover: `${C}/thumb/4/49/Cartier_Panth%C3%A8re_Ruban.jpg/1280px-Cartier_Panth%C3%A8re_Ruban.jpg` },
  {
    keywords: ["black bay", "pelagos", "tudor"],
    cover: `${C}/thumb/8/86/Tudor_Pelagos_for_Carolina_Watch_Club_on_Wrist.jpg/1280px-Tudor_Pelagos_for_Carolina_Watch_Club_on_Wrist.jpg`,
  },
  {
    keywords: ["navitimer", "breitling"],
    cover: `${C}/thumb/6/6a/Breitling_Navitimer-P5200001-black.jpg/1280px-Breitling_Navitimer-P5200001-black.jpg`,
  },
  {
    keywords: ["portugieser", "big pilot", "iwc"],
    cover: `${C}/thumb/e/e8/IWC_Portuguese_Automatic_%28cropped%29.JPG/1280px-IWC_Portuguese_Automatic_%28cropped%29.JPG`,
  },
  { keywords: ["rm 0", "rm-0", "richard mille"], cover: BRAND_STOCK_COVERS["richard-mille"]! },
  {
    keywords: ["monaco", "carrera"],
    cover: "https://images.unsplash.com/photo-1518546305927-5a555bb7020d?w=1200&q=85&auto=format&fit=crop",
  },
];

const RM_WIKI =
  "RM_67-01_Automatic_Extra_Plat.jpg";

export function isPlaceholderListingPhoto(url: string): boolean {
  const u = url.toLowerCase();
  if (u.includes("wikimedia.org")) return true;
  if (u.includes(RM_WIKI.toLowerCase())) return true;
  if (u.includes("hublot-logo") || u.includes("hublot_design_prize")) return true;
  return false;
}

function isYourUploadedPhoto(url: string): boolean {
  if (isPlaceholderListingPhoto(url)) return false;
  return (
    url.includes("supabase.co") ||
    url.includes("blob.vercel-storage.com") ||
    url.includes("/storage/v1/object/") ||
    url.includes("res.cloudinary.com")
  );
}

function productStill(p: Product): string | null {
  const first = (p.media_urls ?? [])[0];
  if (first) return first;
  if (p.video_poster_url) return p.video_poster_url;
  return null;
}

function inventoryHaystack(products: Product[]): string {
  return products
    .map((p) => `${p.name} ${p.brand ?? ""} ${p.description ?? ""}`)
    .join(" ")
    .toLowerCase();
}

function modelStockFromInventory(products: Product[]): string | null {
  const hay = inventoryHaystack(products);
  for (const rule of MODEL_STOCK_RULES) {
    if (rule.keywords.some((k) => hay.includes(k))) return rule.cover;
  }
  return null;
}

function bestUploadedCover(products: Product[]): string | null {
  const ranked = [...products].sort((a, b) => {
    if (a.featured !== b.featured) return a.featured ? -1 : 1;
    return 0;
  });
  for (const p of ranked) {
    const url = productStill(p);
    if (url && isYourUploadedPhoto(url)) return url;
  }
  return null;
}

/**
 * Homepage collection tile art: model/stock shots matched to your inventory,
 * then your real uploads — never seed Wikipedia thumbs or RM press skeletons.
 */
export function pickCollectionCoverImage(
  brandSlug: string,
  inventory: Product[],
  brandImageUrl?: string | null
): string | null {
  const yours = bestUploadedCover(inventory);
  if (yours) return yours;

  const model = modelStockFromInventory(inventory);
  if (model) return model;

  const brandStock = BRAND_STOCK_COVERS[brandSlug];
  if (brandStock) return brandStock;

  if (brandImageUrl && !isPlaceholderListingPhoto(brandImageUrl)) {
    return brandImageUrl;
  }

  return null;
}
