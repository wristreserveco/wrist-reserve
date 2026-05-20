const C = "https://upload.wikimedia.org/wikipedia/commons";

/**
 * Only these brand tiles get a hand-picked swap. Everything else uses
 * `categories.image_url` from the DB (original migration stock photos).
 */
export const COLLECTION_COVER_OVERRIDES: Partial<Record<string, string>> = {
  rolex: `${C}/8/81/Rolex_Datejust_126234.jpg`,
  /** 5711/1A — stainless steel, blue dial. */
  "patek-philippe": `${C}/thumb/0/04/Patek-Philippe-Nautilus-5711-1A-010-1.jpg/1280px-Patek-Philippe-Nautilus-5711-1A-010-1.jpg`,
  /** RM 055 Bubba Watson — official Richard Mille product shot. */
  "richard-mille":
    "https://media.richardmille.com/wp-content/uploads/2019/01/23171231/richard-mille-rm-055-bubba-watson-14412.png?dpr=1&width=1200",
  /** Royal Oak — product shot, no wrist/hand (matches catalog-style tiles). */
  "audemars-piguet": `${C}/0/0e/Audemars_2385_Royal_Oak_resized.jpg`,
  /** Santos medium steel / white dial — official product render (HD). */
  cartier: "/collection-covers/cartier-santos-wssa0029.png",
};

export function collectionCoverForBrand(
  slug: string,
  categoryImageUrl: string | null
): string | null {
  return COLLECTION_COVER_OVERRIDES[slug] ?? categoryImageUrl ?? null;
}
