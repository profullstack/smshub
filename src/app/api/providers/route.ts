import { NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceClient } from "@/lib/supabase/server";
import { isManagedProvider } from "@/lib/managed-numbers/service";
import { MANAGED_API_KEY } from "@/lib/providers";
import { configureTelnyxWebhooks, fetchTelnyxPublicKey, type ConfigureWebhooksResult } from "@/lib/providers/telnyx-api";
import { telnyxWebhookUrl } from "@/lib/providers/provider-check";
import { isSealedProvider, LOCKED_MESSAGE, maskSecret, sealedProviderColumns } from "@/lib/vault/provider-credentials";
import { getSessionKey } from "@/lib/vault/unlock-store";
import { loadSeal } from "@/lib/vault/service";

/** What the browser may see of a provider row: masks only, never a key or a sealed blob. */
function publicProvider(p: Record<string, unknown>) {
  const { sealed_credentials: _sealed, ...rest } = p;
  void _sealed;
  const sealed = isSealedProvider(p);
  return {
    ...rest,
    api_key: sealed ? String(p.api_key_hint ?? "sealed") : maskSecret(String(p.api_key ?? "")),
    api_secret: p.api_secret || (sealed && p.sealed_credentials) ? "set" : null,
    sealed,
    needs_reentry: sealed && !p.sealed_credentials,
  };
}

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const serviceClient = createServiceClient();
    const { data, error } = await serviceClient
      .from("providers")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) throw error;

    // The row that holds rented numbers is internal; secrets never go back to the browser.
    const providers = (data ?? [])
      .filter((p) => !isManagedProvider(p))
      .map((p) => publicProvider(p));

    return NextResponse.json({ providers });
  } catch (error) {
    console.error("List providers error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { type, api_key, api_secret } = body;

    if (!type || !api_key) {
      return NextResponse.json({ error: "type and api_key are required" }, { status: 400 });
    }
    if (!["twilio", "telnyx", "phonenumbers-bot"].includes(type)) {
      return NextResponse.json({ error: "type must be twilio, telnyx or phonenumbers-bot" }, { status: 400 });
    }
    if (api_key === MANAGED_API_KEY) {
      return NextResponse.json({ error: "Invalid api_key" }, { status: 400 });
    }

    // New keys are stored sealed under the user's vault, never in plaintext,
    // so adding one needs an unlocked vault.
    const serviceClient = createServiceClient();
    if (!(await loadSeal(serviceClient, user.id))) {
      return NextResponse.json(
        { error: "Create your key vault first (Settings > Key vault): provider keys are stored sealed under your passphrase.", code: "no_vault" },
        { status: 423 }
      );
    }
    if (!getSessionKey(user.id)) {
      return NextResponse.json({ error: LOCKED_MESSAGE, code: "vault_locked" }, { status: 423 });
    }

    // Telnyx: check the key, fetch the account's webhook signing key (kept as
    // api_secret) and point its messaging profiles at smshub, so nobody has
    // to copy a public key or a webhook URL by hand.
    let secret: string | null = api_secret || null;
    let setup:
      | { publicKey: "fetched" | "entered" | "missing"; publicKeyError?: string; webhooks?: ConfigureWebhooksResult }
      | undefined;
    if (type === "telnyx") {
      const key = await fetchTelnyxPublicKey(String(api_key).trim());
      if (!key.ok && (key.error.status === 401 || key.error.status === 403)) {
        return NextResponse.json(
          { error: `Telnyx rejected this API key: ${key.error.message}`, code: key.error.code },
          { status: 400 }
        );
      }
      const entered = typeof api_secret === "string" && api_secret.trim() ? api_secret.trim() : null;
      secret = entered ?? (key.ok ? key.data : null);
      setup = {
        publicKey: entered ? "entered" : secret ? "fetched" : "missing",
        publicKeyError: key.ok ? undefined : key.error.message,
      };
    }

    const dek = getSessionKey(user.id);
    if (!dek) return NextResponse.json({ error: LOCKED_MESSAGE, code: "vault_locked" }, { status: 423 });
    const id = crypto.randomUUID();
    const plainKey = String(api_key).trim();
    const { data, error } = await serviceClient
      .from("providers")
      .insert({
        id,
        user_id: user.id,
        type,
        ...sealedProviderColumns(dek, user.id, id, type, { api_key: plainKey, api_secret: secret }),
      })
      .select()
      .single();

    if (error) throw error;

    if (setup) setup.webhooks = await configureTelnyxWebhooks(plainKey, telnyxWebhookUrl());

    return NextResponse.json(
      {
        provider: publicProvider(data),
        ...(setup ? { setup } : {}),
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Create provider error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
