"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { AD_SLOT, isAdPage, requestAdScan } from "@/lib/ads";

/**
 * One low-profile CrawlProof text_link unit at the top of the main content on
 * smshub.dev public pages (never the homepage, never above or inside the footer).
 *
 * The wrapper collapses to nothing until ad.js marks the unit `data-cp-filled`
 * (see globals.css). The mount effect asks ad.js to rescan, since client
 * navigation mounts the unit after ad.js's first pass.
 */
export function AdUnit() {
  const pathname = usePathname();
  const show = isAdPage(pathname);

  useEffect(() => {
    if (!show) return;
    return requestAdScan();
  }, [show, pathname]);

  if (!show) return null;

  return (
    <div className="cp-ad-wrap px-4">
      <div
        // Keyed by path so each client navigation mounts a fresh unit: ad.js
        // will not refill an element it has already filled.
        key={pathname}
        className="cp-ad"
        data-cp-ad=""
        data-slot={AD_SLOT}
        data-format="text_link"
      />
    </div>
  );
}
