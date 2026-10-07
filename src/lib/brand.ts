/**
 * White-label brands. One app and one database serve every brand; the request's
 * host picks which name, look and landing page a visitor gets.
 *
 * Hosts map to brands in `BRAND_HOSTS` ("numberstation.xyz=numberstation,
 * www.numberstation.xyz=numberstation"), on top of the built-in hosts below. A
 * host nobody claims gets the default brand, so smshub.dev never changes.
 * Pure on purpose: no next/headers here, so client code and tests can use it.
 */

export type BrandId = "smshub" | "numberstation";

export interface Brand {
  id: BrandId;
  name: string;
  shortName: string;
  title: string;
  tagline: string;
  description: string;
  /** Browser chrome and splash colour. */
  themeColor: string;
  backgroundColor: string;
  /** Where every static asset of this brand lives under /public. */
  assetBase: string;
  manifest: string;
  logo: string;
  favicon: string;
  /** Where an installed app opens. */
  startUrl: string;
  supportEmail: string;
}

export const DEFAULT_BRAND: BrandId = "smshub";

export const BRANDS: Record<BrandId, Brand> = {
  smshub: {
    id: "smshub",
    name: "SMSHub",
    shortName: "SMSHub",
    title: "SMSHub — Multi-platform SMS Messaging",
    tagline: "Multi-platform SMS Messaging",
    description:
      "Send and receive SMS from any device. Multi-provider support with Twilio, Telnyx, and real SIM numbers. Built for developers, designed for everyone.",
    themeColor: "#030712",
    backgroundColor: "#030712",
    assetBase: "",
    manifest: "/manifest.json",
    logo: "/logo.svg",
    favicon: "/favicon.svg",
    startUrl: "/",
    supportEmail: "support@smshub.dev",
  },
  numberstation: {
    id: "numberstation",
    name: "Number Station",
    shortName: "Station",
    title: "Number Station — private numbers, live on one receiver",
    tagline: "Private numbers, live on one receiver",
    description:
      "Rent a private phone number in seconds and watch texts, verification codes and calls land live in one installable app. Pay in crypto, no card, no SIM.",
    themeColor: "#0b0a08",
    backgroundColor: "#0b0a08",
    assetBase: "/brands/numberstation",
    manifest: "/brands/numberstation/manifest.json",
    logo: "/brands/numberstation/logo.svg",
    favicon: "/brands/numberstation/favicon.svg",
    startUrl: "/inbox",
    supportEmail: "support@smshub.dev",
  },
};

/** Hosts that always mean a brand, before BRAND_HOSTS is read. */
const BUILT_IN_HOSTS: Record<string, BrandId> = {
  // Chrome and Firefox resolve *.localhost, so this is how to see it locally.
  "numberstation.localhost": "numberstation",
};

function isBrandId(value: string): value is BrandId {
  return Object.prototype.hasOwnProperty.call(BRANDS, value);
}

export function normalizeHost(host: string | null | undefined): string {
  if (!host) return "";
  // First value of a forwarded list, lower-cased, without the port.
  return host.split(",")[0].trim().toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
}

/** Parse "host=brand,host=brand"; unknown brands and blank pairs are dropped. */
export function parseBrandHosts(value: string | undefined): Record<string, BrandId> {
  const out: Record<string, BrandId> = {};
  for (const pair of (value ?? "").split(",")) {
    const [rawHost, rawBrand] = pair.split("=");
    const host = normalizeHost(rawHost);
    const brand = rawBrand?.trim().toLowerCase() ?? "";
    if (host && isBrandId(brand)) out[host] = brand;
  }
  return out;
}

export function brandHosts(env: NodeJS.ProcessEnv = process.env): Record<string, BrandId> {
  return { ...BUILT_IN_HOSTS, ...parseBrandHosts(env.BRAND_HOSTS) };
}

/** The brand for a request host. `BRAND` forces one, for local work. */
export function brandForHost(host: string | null | undefined, env: NodeJS.ProcessEnv = process.env): Brand {
  const forced = env.BRAND?.trim().toLowerCase();
  if (forced && isBrandId(forced)) return BRANDS[forced];
  const id = brandHosts(env)[normalizeHost(host)];
  return BRANDS[id ?? DEFAULT_BRAND];
}

/**
 * The public origin for a host, but only when that host is a configured brand
 * host. Anything else (an unknown or forged Host header) returns null, so the
 * caller falls back to the canonical site URL and a redirect never leaves us.
 */
export function brandOriginForHost(host: string | null | undefined, env: NodeJS.ProcessEnv = process.env): string | null {
  const h = normalizeHost(host);
  if (!h || !brandHosts(env)[h]) return null;
  if (h.endsWith(".localhost")) {
    const port = /:(\d+)$/.exec(host!.split(",")[0].trim())?.[1];
    return `http://${h}${port ? `:${port}` : ""}`;
  }
  return `https://${h}`;
}
