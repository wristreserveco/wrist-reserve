/** @type {import('next').NextConfig} */
const nextConfig = {
  // Framer Motion pulls in `motion-dom`; bundling it explicitly avoids broken
  // ./vendor-chunks/motion-dom.js resolution during RSC / dev static workers.
  transpilePackages: ["framer-motion"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.supabase.co", pathname: "/storage/v1/object/public/**" },
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "upload.wikimedia.org" },
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
};

export default nextConfig;
