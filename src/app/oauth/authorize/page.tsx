import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { checkAuthorize, type AuthorizeParams } from "@/lib/mcp-oauth";
import { createServerSupabaseClient, createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Connect an app - smshub",
  description: "Allow an AI app (Claude, ChatGPT, ...) to use your smshub account through the smshub MCP server.",
  robots: { index: false, follow: false },
};

const FIELDS = ["response_type", "client_id", "redirect_uri", "code_challenge", "code_challenge_method", "state", "scope", "resource"] as const;

/**
 * OAuth 2.1 authorization endpoint for the MCP server at /api/mcp. Not signed
 * in: round trip through /login (password or CoinPay) and back. Signed in: name
 * the client and ask. The decision posts to /api/oauth/authorize.
 */
export default async function OAuthAuthorizePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const params: Record<string, string> = {};
  for (const f of FIELDS) {
    const v = raw[f];
    if (typeof v === "string") params[f] = v;
  }
  const check = await checkAuthorize(createServiceClient(), params as AuthorizeParams);
  if (!check.ok) {
    if ("redirect" in check) redirect(check.redirect);
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-md space-y-4 text-center">
          <h1 className="text-xl font-semibold">This connection request cannot be used</h1>
          <p className="text-gray-400 text-sm">{check.description}</p>
        </div>
      </main>
    );
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/oauth/authorize?${new URLSearchParams(params).toString()}`)}`);
  }

  const name = check.client.client_name;
  const host = new URL(check.redirectUri).host;
  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <form method="post" action="/api/oauth/authorize" className="w-full max-w-md space-y-5 bg-gray-900 border border-gray-800 rounded-xl p-6">
        <h1 className="text-xl font-semibold">
          Allow <span className="text-blue-400">{name}</span> to use your smshub account?
        </h1>
        <p className="text-sm text-gray-400">
          Signed in as <span className="text-gray-200">{user.email ?? user.id}</span>. {name} will be able to use every smshub MCP tool
          as you: read your inbox and numbers, send texts from your own numbers, rent numbers (you pay for those through a link), and
          manage alerts, groups and webhooks. Its access token lasts an hour and is renewed while the app stays connected; removing the connector in that app ends it.
        </p>
        <p className="text-xs text-gray-500">
          After you decide, you go back to <span className="text-gray-300">{host}</span>.
          {check.client.client_uri ? <> Client site: {check.client.client_uri}</> : null}
        </p>
        {FIELDS.map((f) => (params[f] !== undefined ? <input key={f} type="hidden" name={f} value={params[f]} /> : null))}
        <div className="flex gap-3">
          <button type="submit" name="approve" value="true" className="flex-1 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 font-medium">
            Allow
          </button>
          <button type="submit" name="approve" value="false" className="flex-1 py-2 rounded-lg bg-gray-800 hover:bg-gray-700">
            Deny
          </button>
        </div>
      </form>
    </main>
  );
}
