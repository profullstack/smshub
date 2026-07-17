import { NextResponse, type NextRequest } from "next/server";
import { updateSession as updateSupabaseSession } from "@profullstack/stack/supabase";
import type { SupabaseSessionUpdate } from "@profullstack/stack/supabase";

// Public routes that don't require authentication
const PUBLIC_ROUTES = [
  "/",
  "/login",
  "/register",
  "/forgot-password",
  "/phonenumbers",
  "/offline",
  "/install",
  "/privacy",
  "/terms",
  "/api",
  "/manifest.json",
  "/robots.txt",
  "/sitemap.xml",
];

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(route + "/")
  );
}

export async function updateSession(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Check public routes BEFORE auth — no need to hit Supabase for public pages
  if (isPublicRoute(pathname)) {
    return NextResponse.next({ request });
  }

  const isAuth = pathname.startsWith("/login") || pathname.startsWith("/register");

  let update: SupabaseSessionUpdate;
  try {
    update = await updateSupabaseSession(request);
  } catch {
    // Auth check failed — allow public routes, redirect others to login
    if (!isAuth) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }
    return NextResponse.next({ request });
  }

  const { response, user } = update;

  // Redirect authenticated users away from auth pages → inbox
  if (user && isAuth) {
    const url = request.nextUrl.clone();
    url.pathname = "/inbox";
    return NextResponse.redirect(url);
  }

  // Redirect unauthenticated users to login for protected routes
  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return response;
}
