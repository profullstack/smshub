import { getBrand, getBrandSiteUrl } from "@/lib/brand-server";
import { llmsTxt } from "@/lib/developer-api";

export async function GET(request: Request) {
  const [brand, site] = await Promise.all([getBrand(), getBrandSiteUrl(request)]);
  return new Response(llmsTxt(site, brand.name), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
