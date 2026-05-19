import { ImageResponse } from "next/og";

/**
 * Programmatic icon — Next.js renders this at request time and serves it
 * at `/icon` (and uses it as the PWA install icon, the Apple touch icon,
 * and the modern favicon). One source of truth, no binary assets.
 *
 * Design: a minimal "WR" monogram in gold on the brand black with a faint
 * gold rim, matching the wordmark in the navbar.
 */
export const runtime = "edge";

export const size = {
  width: 512,
  height: 512,
};

export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background:
            "radial-gradient(circle at 50% 35%, #1a1614 0%, #050505 70%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#d4af37",
          fontSize: 280,
          fontFamily: "serif",
          fontWeight: 600,
          letterSpacing: -8,
          border: "12px solid #d4af37",
          borderRadius: 96,
        }}
      >
        WR
      </div>
    ),
    { ...size }
  );
}
