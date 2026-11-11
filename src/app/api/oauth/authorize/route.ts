import { NextResponse, type NextRequest } from "next/server";
import { checkAuthorize, errorRedirect, issueCode, OAuthError, siteOrigin, type AuthorizeParams } from "@/lib/mcp-oauth";
import { createServerSupabaseClient, createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store" };

/**
 * The decision from the consent page at /oauth/authorize (the advertised
 * authorization_endpoint):
 *
 *   form POST  from the consent page, with the cookie session: 303 to the
 *              client's redirect_uri carrying code + state + iss (or
 *              error=access_denied).
 *   JSON POST  with `Authorization: Bearer <session access token>`: the same
 *              decision, answered as { redirect }.
 *
 * CSRF: a cookie-session POST must come from our own origin (Origin header,
 * or Sec-Fetch-Site same-origin); the session cookie is SameSite=Lax as well.
 * A Bearer session cannot be attached by a cross-site form at all.
 */
async function signedInUser(req: NextRequest): Promise<{ id: string } | null> {
  const auth = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(\S+)$/i.exec(auth.trim());
  if (m) {
    const { data } = await createServiceClient().auth.getUser(m[1]);
    return data?.user ? { id: data.user.id } : null;
  }
  const origin = req.headers.get("origin");
  const sameOrigin = origin ? origin === siteOrigin() : req.headers.get("sec-fetch-site") === "same-origin";
  if (!sameOrigin) return null;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { id: user.id } : null;
}

export async function POST(req: NextRequest) {
  const isJson = (req.headers.get("content-type") ?? "").includes("application/json");
  let body: AuthorizeParams & { approve?: unknown };
  try {
    body = isJson
      ? ((await req.json()) as typeof body)
      : (Object.fromEntries(new URLSearchParams(await req.text())) as typeof body);
  } catch {
    return NextResponse.json({ error: "invalid_request", error_description: "Invalid body" }, { status: 400 });
  }
  const approve = body.approve === true || body.approve === "true" ? true : body.approve === false || body.approve === "false" ? false : null;
  if (approve === null) return NextResponse.json({ error: "invalid_request", error_description: "approve is required" }, { status: 400 });

  const user = await signedInUser(req);
  if (!user) return NextResponse.json({ error: "unauthorized", error_description: "Sign in to smshub first" }, { status: 401, headers: NO_STORE });

  const answer = (redirect: string) =>
    isJson ? NextResponse.json({ redirect }, { headers: NO_STORE }) : NextResponse.redirect(redirect, { status: 303, headers: NO_STORE });

  const admin = createServiceClient();
  const check = await checkAuthorize(admin, body);
  if (!check.ok) {
    return "redirect" in check
      ? answer(check.redirect)
      : NextResponse.json({ error: check.error, error_description: check.description }, { status: 400, headers: NO_STORE });
  }
  if (!approve) return answer(errorRedirect(check.redirectUri, "access_denied", "The user denied the request", check.state));
  try {
    return answer(await issueCode(admin, check, user.id));
  } catch (err) {
    if (err instanceof OAuthError) return NextResponse.json(err.body(), { status: err.status, headers: NO_STORE });
    console.error("[oauth] authorize failed", (err as Error).message);
    return NextResponse.json({ error: "server_error" }, { status: 500, headers: NO_STORE });
  }
}
