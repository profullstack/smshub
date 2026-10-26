/**
 * Where to send someone after they sign in, sign up or confirm their email.
 * Only same-origin relative paths are allowed so a crafted `?next=` cannot
 * bounce the user off the site; anything else falls back to the inbox.
 *
 * Browsers and the WHATWG URL parser drop tabs and newlines and treat `\` as
 * `/`, so `/\t/evil.example` becomes `//evil.example`. Control characters and
 * backslashes are refused outright, and the result must resolve same-origin.
 */
const BASE = "http://same-origin.invalid";

export function safeNextPath(next: string | null | undefined, fallback = "/inbox"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || /[\u0000-\u001f\u007f\\]/.test(next)) {
    return fallback;
  }
  try {
    const url = new URL(next, BASE);
    if (url.origin !== BASE) return fallback;
    return url.pathname + url.search + url.hash;
  } catch {
    return fallback;
  }
}

/** The safe `next` from the current page's query string (browser only). */
export function nextFromLocation(fallback = "/inbox"): string {
  if (typeof window === "undefined") return fallback;
  return safeNextPath(new URLSearchParams(window.location.search).get("next"), fallback);
}
