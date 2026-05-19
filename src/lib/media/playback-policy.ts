/**
 * Centralised "should this device play video?" policy.
 *
 * Why this exists: autoplaying product videos on every visit was burning
 * the Supabase Storage egress budget at >2× the free-plan cap. We now
 * gate video playback on a few cheap signals so we only spend bandwidth
 * when the buyer is actively engaged.
 *
 * Signals:
 *   - hover-capable pointer (matchMedia "(hover: hover) and (pointer: fine)")
 *     → desktop / laptop with a mouse. Safe to play on hover.
 *   - Save-Data header equivalent (navigator.connection.saveData)
 *     → user opted into data savings. Never autoplay.
 *   - effectiveType "slow-2g" / "2g" / "3g"
 *     → respect their slow link. Never autoplay.
 *
 * All hooks are SSR-safe (return conservative defaults during the first
 * render so the markup matches, then update on mount).
 */

import { useEffect, useState } from "react";

interface NetworkInformation {
  saveData?: boolean;
  effectiveType?: "slow-2g" | "2g" | "3g" | "4g";
}

function getNetwork(): NetworkInformation | null {
  if (typeof navigator === "undefined") return null;
  // The connection API isn't on Safari yet; treat undefined as fast.
  const n = (
    navigator as unknown as { connection?: NetworkInformation }
  ).connection;
  return n ?? null;
}

export function shouldRespectDataSaver(): boolean {
  const n = getNetwork();
  if (!n) return false;
  if (n.saveData === true) return true;
  if (n.effectiveType && (n.effectiveType === "slow-2g" || n.effectiveType === "2g" || n.effectiveType === "3g")) {
    return true;
  }
  return false;
}

/**
 * React hook: returns true when this device can hover AND the network isn't
 * data-restricted. Use as a hard gate for autoplay on cards/hover surfaces.
 */
export function useCanAutoplay(): boolean {
  const [canAutoplay, setCanAutoplay] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }
    const m = window.matchMedia("(hover: hover) and (pointer: fine)");
    const compute = () => {
      if (shouldRespectDataSaver()) {
        setCanAutoplay(false);
        return;
      }
      setCanAutoplay(m.matches);
    };
    compute();
    m.addEventListener("change", compute);
    return () => m.removeEventListener("change", compute);
  }, []);

  return canAutoplay;
}
