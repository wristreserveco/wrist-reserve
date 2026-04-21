# Database migrations

Run these in the Supabase SQL Editor **in order**. Every script is idempotent
(`if not exists`, `on conflict do nothing`, guarded `alter table`s) so it's safe
to re-run if you're unsure what's already applied.

## Order of operations

| # | File | What it does |
|---|------|--------------|
| 001 | `001_initial.sql` | Core tables: products, messages, orders. |
| 002 | `002_products_media.sql` | Adds `media_urls`, `video_url` to `products`. |
| 003 | `003_categories.sql` | Creates the `categories` table + FK on `products`. |
| 004 | `004_hero_slides.sql` | `hero_slides` table for the CMS hero. |
| 005 | `005_orders_manual.sql` | Manual payment columns on `orders`. |
| 006 | `006_video_trim.sql` | `video_trim_start` / `_end` on `products`. |
| 007 | `007_hero_cms.sql` | Final hero CMS columns. |
| 008 | `008_chat_attachments.sql` | Chat image/video attachments. |
| 009 | `009_category_parent.sql` | Hierarchical categories (`parent_id`). |
| 010 | `010_order_tracking.sql` | Proof of payment + shipping + audit log. |
| 011 | `011_square_and_seed_categories.sql` | `square_url` column + seed 19 watch brands and ~90 sub-models. |
| 012 | `012_upload_limit_and_tier.sql` | Raises Storage bucket size limit to 500 MB; adds `products.tier` (`classic` / `reserve`). Superseded by 013 — run 013 right after. |
| 013 | `013_rename_reserve_tier.sql` | Renames the premium tier value from `reserve` → `super_tier` and updates the check constraint. Idempotent. |
| 014 | `014_category_images_and_cleanup.sql` | Prunes the catalog down to the 7 brands we're carrying (Rolex, AP, Patek, Richard Mille, Omega, Cartier, Hublot) and fills in representative watch photos from Wikimedia Commons. Anything we couldn't source cleanly is left `null` so the admin can drop in their own inventory photo. |

## If you see this error

> `Could not find the table 'public.categories' in the schema cache`

You haven't run migration **003** (and everything after it) yet. Go to the
Supabase dashboard → **SQL Editor** → paste each file in order → **Run**.

## Storage setup

If your `product-media` bucket is missing, create it manually in the Supabase
dashboard (Storage → **New bucket** → name `product-media`, **Public** enabled).
Then run migration 012 to raise the file size limit to 500 MB.

Alternatively, in the dashboard you can edit the bucket directly:
**Storage → `product-media` → Edit → File size limit → 500 MB**.

## What changed recently

- **012** is the newest. Run it now if you see "object exceeded the maximum
  allowed size" when uploading video, or if you want the `Classic` / `Reserve`
  tier feature to work.
- **011** seeds the default Rolex / Patek / AP / Omega / etc. taxonomy. If you'd
  rather use the Admin UI: **Admin → Categories → Import default brands**.
