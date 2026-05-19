import type { MetadataRoute } from "next";

/**
 * PWA manifest — installable to home screen on iOS / Android, gives the
 * site an app-like splash + standalone window without requiring a service
 * worker. We deliberately do NOT register an SW: opaque caching can ship
 * stale product / pricing data, and removing one is invasive once installed.
 *
 * The icon endpoints are served by `src/app/icon.tsx` (favicon + 512px
 * maskable) so we don't ship binary assets in the repo.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Wrist Reserve",
    short_name: "Wrist Reserve",
    description:
      "A minimal luxury destination for affordable timepieces. Fast, encrypted checkout. Insured worldwide shipping.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#000000",
    theme_color: "#000000",
    categories: ["shopping", "lifestyle"],
    icons: [
      {
        src: "/icon",
        sizes: "any",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon",
        sizes: "any",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
