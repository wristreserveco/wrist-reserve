import { ImageResponse } from "next/og";

/**
 * Apple touch icon — served at `/apple-icon` and surfaced when iOS users
 * "Add to Home Screen". Slightly larger inset + rounder corners look
 * native on iOS, where the OS clips at ~22% radius automatically.
 */
export const runtime = "edge";

export const size = {
  width: 180,
  height: 180,
};

export const contentType = "image/png";

export default function AppleIcon() {
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
          fontSize: 96,
          fontFamily: "serif",
          fontWeight: 600,
          letterSpacing: -3,
        }}
      >
        WR
      </div>
    ),
    { ...size }
  );
}
