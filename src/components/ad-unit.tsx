"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { AD_SLOT, isAdPage, requestAdScan, type AdFormat } from "@/lib/ads";

/** 728x90 needs the full content column; narrower viewports get the 300x250. */
const LEADERBOARD_QUERY = "(min-width: 768px)";

/**
 * One CrawlProof unit at the top of the content on smshub.dev public pages.
 *
 * The div is rendered without `data-slot`, so ad.js's own first pass skips it;
 * the mount effect picks one format from the viewport, sets slot + format and
 * asks for a scan. Exactly one fill, never a hidden twin. The wrapper collapses
 * to nothing until ad.js marks the unit `data-cp-filled` (see globals.css).
 */
export function AdUnit() {
  const pathname = usePathname();
  const show = isAdPage(pathname);
  const [format, setFormat] = useState<AdFormat | null>(null);

  useEffect(() => {
    if (!show) return;
    setFormat(window.matchMedia(LEADERBOARD_QUERY).matches ? "banner_728x90" : "banner_300x250");
  }, [show]);

  useEffect(() => {
    if (!show || !format) return;
    return requestAdScan();
  }, [show, format, pathname]);

  if (!show) return null;

  return (
    <div className="cp-ad-wrap flex justify-center px-4">
      <div
        // Keyed by path so each client navigation mounts a fresh unit: ad.js
        // will not refill an element it has already filled.
        key={`${pathname}:${format ?? "pending"}`}
        className="cp-ad"
        data-cp-ad=""
        data-slot={format ? AD_SLOT : undefined}
        data-format={format ?? undefined}
      />
    </div>
  );
}
