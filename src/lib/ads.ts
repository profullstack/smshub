/**
 * CrawlProof ad slot for smshub.dev. Manage it at https://crawlproof.com/ads/slots
 *
 * Only the smshub brand renders it: white-label brand hosts use their own
 * layout (StationChrome) and never mount the unit.
 */
export const AD_SLOT = "97061bef-7275-45db-a9e4-40c3fa1b59b9";

export type AdFormat = "banner_300x250" | "banner_728x90" | "text_link";

/** Heights ad.js gives each format, reserved once the unit starts filling. */
export const AD_HEIGHTS: Record<AdFormat, number> = {
  banner_300x250: 250,
  banner_728x90: 90,
  text_link: 40,
};

/**
 * Public marketing/docs pages that carry the unit. The homepage and everything
 * else (inbox, numbers, settings, auth, checkout) stays ad-free.
 */
const AD_EXACT = new Set(["/privacy", "/terms", "/sms", "/install", "/phonenumbers", "/verification-numbers"]);
const AD_PREFIXES = ["/docs"];

export function isAdPage(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  if (AD_EXACT.has(path)) return true;
  return AD_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}

declare global {
  interface Window {
    crawlproofAds?: { scan: () => void };
  }
}

const SCAN_RETRY_MS = 200;
const SCAN_MAX_TRIES = 25;

/**
 * ad.js scans for `[data-cp-ad]` once, at DOMContentLoaded, and then only when
 * asked. The unit sets its slot in a mount effect (and client navigation mounts
 * it late), so it requests the rescan itself, retrying until ad.js is on the
 * page and giving up after ~5s so an ad blocker leaves no timer running.
 */
export function requestAdScan(): () => void {
  if (typeof window === "undefined") return () => {};
  let cancelled = false;
  let tries = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const tick = () => {
    if (cancelled) return;
    if (window.crawlproofAds) {
      window.crawlproofAds.scan();
      return;
    }
    if (++tries > SCAN_MAX_TRIES) return;
    timer = setTimeout(tick, SCAN_RETRY_MS);
  };
  tick();
  return () => {
    cancelled = true;
    if (timer) clearTimeout(timer);
  };
}
