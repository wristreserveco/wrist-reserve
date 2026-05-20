/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    // Baked at build time so the storefront can prove which deploy is running
    // (helps debug Safari / PWA holding stale checkout bundles).
    NEXT_PUBLIC_VERCEL_DEPLOYMENT_ID: process.env.VERCEL_DEPLOYMENT_ID ?? "",
  },
  // Stop advertising "X-Powered-By: Next.js" on every response — small but
  // free reduction in fingerprintable stack info.
  poweredByHeader: false,

  // Framer Motion pulls in `motion-dom`; bundling it explicitly avoids broken
  // ./vendor-chunks/motion-dom.js resolution during RSC / dev static workers.
  transpilePackages: ["framer-motion"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.supabase.co", pathname: "/storage/v1/object/public/**" },
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "upload.wikimedia.org" },
      { protocol: "https", hostname: "media.richardmille.com" },
    ],
  },
  experimental: {
    // Avoid parallel webpack workers that can emit chunk paths out of sync with
    // webpack-runtime (fixes intermittent "Cannot find module './682.js'" on build).
    webpackBuildWorker: false,
    serverActions: {
      bodySizeLimit: "60mb",
    },
  },

  // ───────────────────────────────────────────────────────────────────────
  //  Security headers
  // ───────────────────────────────────────────────────────────────────────
  //
  // Hardens every response without affecting the buyer experience. CSP is
  // deliberately omitted here — Next.js + framer-motion + PayPal SDK need
  // 'unsafe-inline' / 'unsafe-eval' which weakens CSP enough that the
  // other headers carry more real weight. Add nonce-based CSP later.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // Block this site from being framed by anyone else (clickjacking).
          // SAMEORIGIN keeps it usable for our own admin previews.
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          // Stop browsers from MIME-sniffing — closes a class of XSS
          // through "looks like html" uploads.
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Don't leak full URLs in Referer headers when buyers click
          // outbound links (analytics, paypal redirect, etc).
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Lock down browser features we don't use. Camera/mic stay
          // disabled so a compromised script can't pop a permission prompt.
          {
            key: "Permissions-Policy",
            value:
              "camera=(), microphone=(), geolocation=(), interest-cohort=(), browsing-topics=()",
          },
          // Long-lived HSTS already comes from Vercel by default, but we
          // re-assert with `includeSubDomains` + `preload` so the apex and
          // any future subdomain stays HTTPS-only.
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          // Block legacy proxies / very old browsers from caching cross-
          // origin responses we don't authorize.
          { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
        ],
      },
    ];
  },
};

export default nextConfig;
