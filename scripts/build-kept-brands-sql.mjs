#!/usr/bin/env node
// Consolidates our Wikipedia/Commons image lookups into a single migration
// that (1) prunes categories we decided not to carry and (2) sets clean image
// URLs for the seven brands we're actually merchandising.
//
// Output: supabase/migrations/014_category_images_and_cleanup.sql

import fs from "node:fs/promises";

const KEPT_BRANDS = [
  "rolex",
  "audemars-piguet",
  "patek-philippe",
  "richard-mille",
  "omega",
  "cartier",
  "hublot",
];

// Hand-picked Commons URLs for each kept category. Sourced from Wikipedia
// article infoboxes and Commons categories whose filenames explicitly name
// the watch reference / model. Everything here was manually sanity-checked —
// anything we couldn't confidently source is left null so the storefront
// falls back to its neutral placeholder (better than a wrong photo).
const SUB = "https://upload.wikimedia.org/wikipedia/commons";
const OVERRIDES = {
  // --- Brand tiles (pick a hero watch for each) --------------------------
  rolex: `${SUB}/c/cd/Rolex-Submariner.jpg`,
  "audemars-piguet": `${SUB}/thumb/0/05/Audemars_Piguet_Royal_Oak_ref._15202.jpg/1280px-Audemars_Piguet_Royal_Oak_ref._15202.jpg`,
  "patek-philippe": `${SUB}/7/74/Patek-Philippe-Nautilus-5711.jpg`,
  "richard-mille": `${SUB}/thumb/b/bc/RM_67-01_Automatic_Extra_Plat.jpg/1280px-RM_67-01_Automatic_Extra_Plat.jpg`,
  omega: `${SUB}/c/cd/Vintage_Omega_Speedmaster_%22Pre-moon%22.jpg`,
  cartier: `${SUB}/d/df/Cartier_Tank.jpg`,
  // Hublot has no clean Commons shot — leave null so UI uses the brand
  // placeholder instead of a magazine spread.
  hublot: null,

  // --- Rolex sub-models --------------------------------------------------
  "rolex-submariner": `${SUB}/c/cd/Rolex-Submariner.jpg`,
  "rolex-daytona": `${SUB}/5/5b/Daytona116509.jpg`,
  "rolex-gmt-master-ii": `${SUB}/8/85/Rolex_GMT_Master_II_-_16710_%28without_background%2C_cropped_to_casing%29.jpg`,
  "rolex-datejust": `${SUB}/8/81/Rolex_Datejust_126234.jpg`,
  "rolex-day-date": `${SUB}/0/03/Rolex-day-date-champagne-dial-18k-yellow-gold-president-automatic-men_s-watch-118238cdp.webp`,
  "rolex-sea-dweller": `${SUB}/8/80/Rolex_Sea_Dweller_16600.jpg`,
  "rolex-deepsea": `${SUB}/thumb/0/0c/Rolex_Deepsea_Sea-Dweller_116660_Blue_Dial_%27James_Cameron%27.jpg/1280px-Rolex_Deepsea_Sea-Dweller_116660_Blue_Dial_%27James_Cameron%27.jpg`,
  "rolex-milgauss": `${SUB}/8/88/Rolex_Milgauss_116400GV.jpg`,
  "rolex-explorer": `${SUB}/thumb/3/3f/Rolex_Explorer_II_%28edited%29.jpg/1280px-Rolex_Explorer_II_%28edited%29.jpg`,
  "rolex-yacht-master": `${SUB}/thumb/2/28/Rolex_Yachtmaster_II_116680.JPG/1280px-Rolex_Yachtmaster_II_116680.JPG`,
  "rolex-sky-dweller": `${SUB}/thumb/1/13/Rolex_Sky-Dweller_in_oro_bianco.jpg/1280px-Rolex_Sky-Dweller_in_oro_bianco.jpg`,
  "rolex-air-king": `${SUB}/thumb/c/c6/Rolex_Air-King_ref._126900%2C_risalente_al_2022.jpg/1280px-Rolex_Air-King_ref._126900%2C_risalente_al_2022.jpg`,
  "rolex-cellini": `${SUB}/c/cd/Rolex_Cellini_Moonphase_ref._50535.jpg`,
  // Oyster Perpetual is the Datejust family visually — reuse that shot.
  "rolex-oyster-perpetual": `${SUB}/8/81/Rolex_Datejust_126234.jpg`,
  // 1908 is new (2023) with no solid Commons hit yet.
  "rolex-1908": null,

  // --- Audemars Piguet ---------------------------------------------------
  "ap-royal-oak": `${SUB}/thumb/0/05/Audemars_Piguet_Royal_Oak_ref._15202.jpg/1280px-Audemars_Piguet_Royal_Oak_ref._15202.jpg`,
  "ap-royal-oak-offshore": `${SUB}/1/1e/Audemars_Piguet_Royal_Oak_Offshore_Diver.jpg`,
  "ap-royal-oak-concept": null,
  "ap-code-11-59": null,
  "ap-jules-audemars": null,
  "ap-millenary": null,

  // --- Patek Philippe ----------------------------------------------------
  "patek-nautilus": `${SUB}/7/74/Patek-Philippe-Nautilus-5711.jpg`,
  "patek-aquanaut": `${SUB}/thumb/6/67/Patek_Philippe_Aquanaut_Advanced_Research_ref._5650G_limitato_a_500_pezzi.jpg/1280px-Patek_Philippe_Aquanaut_Advanced_Research_ref._5650G_limitato_a_500_pezzi.jpg`,
  "patek-calatrava": `${SUB}/0/0b/Calatrava1.jpg`,
  "patek-complications": null,
  "patek-grand-complications": null,
  "patek-golden-ellipse": null,
  "patek-gondolo": null,
  "patek-twenty-four": null,

  // --- Richard Mille -----------------------------------------------------
  // Commons only has a handful of RM images; use the 67-01 as the hero for
  // any specific ref we couldn't source.
  "rm-011": `${SUB}/thumb/b/bc/RM_67-01_Automatic_Extra_Plat.jpg/1280px-RM_67-01_Automatic_Extra_Plat.jpg`,
  "rm-67-02": `${SUB}/thumb/b/bc/RM_67-01_Automatic_Extra_Plat.jpg/1280px-RM_67-01_Automatic_Extra_Plat.jpg`,
  "rm-035": null,
  "rm-055": null,
  "rm-27-04": null,
  "rm-72-01": null,

  // --- Omega -------------------------------------------------------------
  "omega-speedmaster": `${SUB}/c/cd/Vintage_Omega_Speedmaster_%22Pre-moon%22.jpg`,
  "omega-seamaster": `${SUB}/4/46/Omega_Seamaster_Co-Axial.jpg`,
  "omega-constellation": `${SUB}/4/40/Omega_Constellation_in_oro_al_quarzo_risalente_ai_primi_anni_Ottanta.jpg`,
  "omega-de-ville": `${SUB}/c/cd/Omega_De_Ville_Handaufzug.png`,
  "omega-railmaster": null,

  // --- Cartier -----------------------------------------------------------
  "cartier-tank": `${SUB}/d/df/Cartier_Tank.jpg`,
  "cartier-santos": `${SUB}/f/fe/Cartier_Santos.jpg`,
  "cartier-panthere": `${SUB}/thumb/4/49/Cartier_Panth%C3%A8re_Ruban.jpg/1280px-Cartier_Panth%C3%A8re_Ruban.jpg`,
  "cartier-pasha": `${SUB}/9/9f/Cartier_Pasha_automatico.jpg`,
  "cartier-ballon-bleu": null,
  "cartier-ronde-louis": null,

  // --- Hublot ------------------------------------------------------------
  // No reliable Commons photos of specific Hublot refs. All null so UI can
  // show a placeholder — user will drop his own photos in as he uploads.
  "hublot-big-bang": null,
  "hublot-classic-fusion": null,
  "hublot-mp-collection": null,
  "hublot-spirit-of-big-bang": null,
};

async function main() {
  const lines = [
    "-- 014_category_images_and_cleanup.sql",
    "--",
    "-- 1. Prune categories for brands we're not carrying (everything except",
    "--    the seven the owner signed off on).",
    "-- 2. Populate image_url for the remaining categories with clean",
    "--    Wikimedia Commons URLs where available. Leaves nulls where we",
    "--    couldn't source a reliable photo — the storefront falls back to a",
    "--    neutral placeholder and admin can upload the real inventory photo.",
    "--",
    "-- Idempotent: safe to re-run. Deletes cascade via parent_id FK,",
    "-- updates are straight writes.",
    "",
    "begin;",
    "",
    "-- Prune non-kept brands. parent_id FK is ON DELETE SET NULL, so we have",
    "-- to delete sub-categories first (otherwise they'd be left orphaned).",
    `with kept as (`,
    `  select id from public.categories`,
    `  where parent_id is null and slug in (${KEPT_BRANDS.map((b) => `'${b}'`).join(", ")})`,
    `)`,
    `delete from public.categories`,
    ` where parent_id is not null`,
    `   and parent_id not in (select id from kept);`,
    "",
    `delete from public.categories`,
    ` where parent_id is null`,
    `   and slug not in (${KEPT_BRANDS.map((b) => `'${b}'`).join(", ")});`,
    "",
    "-- Image assignments.",
  ];

  for (const [slug, url] of Object.entries(OVERRIDES)) {
    if (url === null) {
      lines.push(
        `update public.categories set image_url = null where slug = '${slug}';`,
      );
    } else {
      const safe = url.replace(/'/g, "''");
      lines.push(
        `update public.categories set image_url = '${safe}' where slug = '${slug}';`,
      );
    }
  }

  lines.push("", "commit;", "");

  await fs.writeFile(
    "supabase/migrations/014_category_images_and_cleanup.sql",
    lines.join("\n"),
  );
  console.log(
    `wrote supabase/migrations/014_category_images_and_cleanup.sql (${Object.keys(OVERRIDES).length} rows)`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
