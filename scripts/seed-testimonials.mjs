#!/usr/bin/env node
/**
 * One-shot seed for the Word of Mouth wall.
 *
 * Reads the 5 IG / iMessage screenshots out of the workspace's
 * `assets/` cache, uploads each to the `product-media` bucket, then
 * inserts a `testimonials` row with the right caption + source.
 *
 * Idempotent-ish: if a testimonial with the same `image_url` already
 * exists we skip it (so re-running the script doesn't double-seed).
 *
 * Usage:  node scripts/seed-testimonials.mjs
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

const ASSETS_DIR =
  "/Users/billgilbert/.cursor/projects/Users-billgilbert-Documents-Wrist-Reserve/assets";

// Each entry maps a real screenshot file to the metadata we want surfaced
// on the public wall.
const SEED = [
  {
    file: "IMG_2432-afe7a506-9570-4570-9484-5924621d6a79.png",
    source: "Instagram",
    customer_name: "—",
    caption:
      "Absolutely beautiful piece of art. Decided to get it for my 1 year & 2 months of sobriety. Amazing quality and A1 customer service.",
    posted_at: "2026-01-24T14:53:00Z",
    sort_order: 100,
  },
  {
    file: "IMG_2433-cda97d36-6454-46bb-a6c1-346a73325934.png",
    source: "iMessage",
    customer_name: "—",
    caption:
      "I'm absolutely in love with my new piece. The quality is high as I expected.",
    posted_at: "2026-02-20T15:00:00Z",
    sort_order: 95,
  },
  {
    file: "IMG_2730-f940d446-23b9-4701-9750-9fa8eaf1ac87.png",
    source: "Instagram",
    customer_name: "—",
    caption: "That's beautiful!!!",
    posted_at: "2026-02-11T17:43:00Z",
    sort_order: 90,
  },
  {
    file: "IMG_2103-462f30aa-30fe-43af-9e20-2d5a8b2562a0.png",
    source: "iMessage",
    customer_name: "—",
    caption: "Looks good!",
    posted_at: "2026-03-05T15:17:00Z",
    sort_order: 85,
  },
  {
    file: "IMG_3140-0c5c14a9-42b5-4826-91fe-c4451ff0a496.png",
    source: "iMessage",
    customer_name: "—",
    caption: "It looks good!",
    posted_at: "2026-03-22T12:00:00Z",
    sort_order: 80,
  },
];

const BUCKET = "product-media";

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 80);
}

async function uploadOne(absPath, originalName) {
  const buf = await fs.readFile(absPath);
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  const stem = slugify(originalName.replace(/\.[^.]+$/, ""));
  const ext = path.extname(originalName).slice(1).toLowerCase() || "png";
  const key = `testimonials/${ts}-${rand}-${stem}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(key, buf, {
      contentType: `image/${ext === "jpg" ? "jpeg" : ext}`,
      cacheControl: "3600",
      upsert: false,
    });
  if (upErr) throw upErr;

  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(key);
  return pub.publicUrl;
}

async function main() {
  // Sanity check — does the testimonials table exist?
  const probe = await supabase.from("testimonials").select("id").limit(1);
  if (probe.error) {
    if (/relation|does not exist/i.test(probe.error.message)) {
      console.error(
        "✗ testimonials table not found. Run supabase/migrations/022_testimonials.sql in your Supabase SQL editor first."
      );
      process.exit(1);
    }
    throw probe.error;
  }

  for (const item of SEED) {
    const abs = path.join(ASSETS_DIR, item.file);
    try {
      await fs.access(abs);
    } catch {
      console.warn(`  ⊘ skip — file not found: ${item.file}`);
      continue;
    }

    console.log(`↑ uploading ${item.file}…`);
    const publicUrl = await uploadOne(abs, item.file);

    // Idempotent guard: skip if a row already exists for this exact URL.
    // (Won't dedupe across re-uploads since we generate fresh paths, but
    // protects against re-running this exact script.)
    const existing = await supabase
      .from("testimonials")
      .select("id")
      .eq("image_url", publicUrl)
      .maybeSingle();
    if (existing.data) {
      console.log("   ↳ already seeded, skipping insert");
      continue;
    }

    const { error: insErr } = await supabase.from("testimonials").insert({
      image_url: publicUrl,
      source: item.source,
      customer_name: item.customer_name,
      caption: item.caption,
      posted_at: item.posted_at,
      sort_order: item.sort_order,
      active: true,
    });
    if (insErr) {
      console.error(`   ✗ insert failed: ${insErr.message}`);
      continue;
    }
    console.log(`   ✓ inserted (${item.source} · ${item.posted_at?.slice(0, 10)})`);
  }

  const total = await supabase
    .from("testimonials")
    .select("id", { count: "exact", head: true });
  console.log(`\nDone. ${total.count ?? "?"} testimonials in the wall.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
