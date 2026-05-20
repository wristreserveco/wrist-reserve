const C = "https://upload.wikimedia.org/wikipedia/commons";

/**
 * Only these brand tiles get a hand-picked swap. Everything else uses
 * `categories.image_url` from the DB (original migration stock photos).
 */
export const COLLECTION_COVER_OVERRIDES: Partial<Record<string, string>> = {
  rolex: `${C}/8/81/Rolex_Datejust_126234.jpg`,
  "patek-philippe": `${C}/7/74/Patek-Philippe-Nautilus-5711.jpg`,
  "richard-mille": `${C}/thumb/2/28/RM_030_Automatic.jpg/1280px-RM_030_Automatic.jpg`,
  cartier: `${C}/f/fe/Cartier_Santos.jpg`,
  /** Big Bang / “Bubba” — real Hublot hero, not a random chrono. */
  hublot: `${C}/thumb/0/03/Kudi_Hublot_Design_Prize_2022.jpg/1280px-Kudi_Hublot_Design_Prize_2022.jpg`,
};

export function collectionCoverForBrand(
  slug: string,
  categoryImageUrl: string | null
): string | null {
  return COLLECTION_COVER_OVERRIDES[slug] ?? categoryImageUrl ?? null;
}
