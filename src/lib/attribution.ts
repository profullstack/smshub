/**
 * First-touch source attribution for orders. No PII: only the campaign tags a
 * link carried (utm_source, utm_medium, utm_campaign, ref) and the day it was
 * first seen.
 *
 *   - Web: middleware sets the `smshub_src` cookie (30 days) the first time a
 *     page is opened with any of those query params, and never overwrites it.
 *   - API / MCP: callers may send `X-Source: utm_source=devto&utm_campaign=x`
 *     (or a bare `devto`, or a JSON object with the same keys).
 *
 * createOrder copies whichever applies into number_orders.source.
 */

export const SOURCE_COOKIE = "smshub_src";
export const SOURCE_HEADER = "x-source";
export const SOURCE_MAX_AGE = 60 * 60 * 24 * 30;
export const SOURCE_KEYS = ["utm_source", "utm_medium", "utm_campaign", "ref"] as const;
const MAX_VALUE = 64;
const MAX_RAW = 1024;

export type SourceKey = (typeof SOURCE_KEYS)[number];
export type Source = Partial<Record<SourceKey, string>> & { at?: string };

/** Keep tag-like characters only and cap the length; "" when nothing is left. */
export function cleanSourceValue(v: unknown): string {
  if (typeof v !== "string") return "";
  return v
    .trim()
    .replace(/[^A-Za-z0-9._~+-]/g, "")
    .slice(0, MAX_VALUE);
}

function fromEntries(get: (k: string) => unknown, at?: unknown): Source | null {
  const src: Source = {};
  for (const k of SOURCE_KEYS) {
    const v = cleanSourceValue(get(k));
    if (v) src[k] = v;
  }
  if (!SOURCE_KEYS.some((k) => src[k])) return null;
  if (typeof at === "string" && /^\d{4}-\d{2}-\d{2}$/.test(at)) src.at = at;
  return src;
}

/** The campaign tags in a page URL's query string, or null when there are none. */
export function sourceFromParams(params: URLSearchParams, now = new Date()): Source | null {
  const src = fromEntries((k) => params.get(k));
  if (src) src.at = now.toISOString().slice(0, 10);
  return src;
}

/** Cookie value: a query string of the cleaned tags (safe characters only). */
export function encodeSource(src: Source): string {
  const p = new URLSearchParams();
  for (const k of SOURCE_KEYS) if (src[k]) p.set(k, src[k]!);
  if (src.at) p.set("at", src.at);
  return p.toString();
}

/**
 * Read a cookie value or an X-Source header. Accepts `k=v&k=v` (URL-encoded or
 * not), a JSON object, or a bare token (taken as utm_source). Anything else is
 * null; this never throws.
 */
export function parseSource(raw: string | null | undefined): Source | null {
  if (!raw) return null;
  let s = raw.trim().slice(0, MAX_RAW);
  if (!s) return null;
  if (/%[0-9A-Fa-f]{2}/.test(s) && !s.includes("=")) {
    try {
      s = decodeURIComponent(s);
    } catch {
      return null;
    }
  }
  if (s.startsWith("{")) {
    try {
      const o = JSON.parse(s) as Record<string, unknown>;
      if (!o || typeof o !== "object" || Array.isArray(o)) return null;
      return fromEntries((k) => o[k], o.at);
    } catch {
      return null;
    }
  }
  if (s.includes("=")) {
    const p = new URLSearchParams(s);
    return fromEntries((k) => p.get(k), p.get("at"));
  }
  // A bare token must already be tag-like; "[1,2]" is junk, not "12".
  return /^[A-Za-z0-9._~+-]{1,64}$/.test(s) ? { utm_source: s } : null;
}

function cookieValue(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

/**
 * Where an order came from: the X-Source header when an API/MCP caller sent
 * one, otherwise the first-touch cookie the browser carries.
 */
export function sourceFromRequest(request: Request): Source | null {
  return (
    parseSource(request.headers.get(SOURCE_HEADER)) ??
    parseSource(cookieValue(request.headers.get("cookie"), SOURCE_COOKIE))
  );
}
