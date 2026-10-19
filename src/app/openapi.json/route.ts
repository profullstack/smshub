import { NextResponse } from "next/server";
import { getBrand, getBrandSiteUrl } from "@/lib/brand-server";
import { openApi } from "@/lib/developer-api";

export async function GET(request: Request) {
  const [brand, site] = await Promise.all([getBrand(), getBrandSiteUrl(request)]);
  return NextResponse.json(openApi(site, brand.name), { headers: { "Access-Control-Allow-Origin": "*" } });
}
