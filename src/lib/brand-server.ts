import { headers } from "next/headers";
import { brandForHost, brandOriginForHost, type Brand } from "@/lib/brand";
import { getSiteUrl } from "@/lib/site-url";

async function requestHost(request?: Request): Promise<string | null> {
  const h = request ? request.headers : await headers();
  return h.get("x-forwarded-host") ?? h.get("host");
}

/** The brand this request is for, from its host. */
export async function getBrand(): Promise<Brand> {
  return brandForHost(await requestHost());
}

/**
 * The origin to send a person back to: the brand host they came in on when it
 * is a configured brand host, else the canonical site URL. Use for redirects a
 * human follows (login, checkout return), never for provider webhooks, which
 * stay on the canonical site. Route handlers pass their request.
 */
export async function getBrandSiteUrl(request?: Request): Promise<string> {
  return brandOriginForHost(await requestHost(request)) ?? getSiteUrl();
}
