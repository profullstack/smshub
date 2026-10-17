/**
 * Where to send someone after they sign in, sign up or confirm their email.
 * Only same-origin relative paths are allowed so a crafted `?next=` cannot
 * bounce the user off the site; anything else falls back to the inbox.
 */
export function safeNextPath(next: string | null | undefined, fallback = "/inbox"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return fallback;
  }
  return next;
}

/** The safe `next` from the current page's query string (browser only). */
export function nextFromLocation(fallback = "/inbox"): string {
  if (typeof window === "undefined") return fallback;
  return safeNextPath(new URLSearchParams(window.location.search).get("next"), fallback);
}
