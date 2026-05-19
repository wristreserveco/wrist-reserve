-- 021_review_photos.sql
-- Adds optional reviewer-attached photos. Stored as a jsonb array of public
-- URLs (matches how `products.media_urls` is stored) so the admin can
-- attach a few images to any review without needing a separate join table.
--
-- Backwards-compatible: existing rows get NULL and the public review card
-- simply skips the photo strip if the column is missing or empty.

alter table public.product_reviews
  add column if not exists photos jsonb;
