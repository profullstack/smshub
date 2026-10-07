import { NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceClient } from "@/lib/supabase/server";
import { isManagedProvider } from "@/lib/managed-numbers/service";
import { MANAGED_API_KEY } from "@/lib/providers";
import { configureTelnyxWebhooks, fetchTelnyxPublicKey, type ConfigureWebhooksResult } from "@/lib/providers/telnyx-api";
import { telnyxWebhookUrl } from "@/lib/providers/provider-check";

function maskSecret(s: string): string {
  return s.length > 12 ? `${s.slice(0, 8)}…${s.slice(-4)}` : `${s.slice(0, 4)}…`;
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
      .map((p) => ({ ...p, api_key: maskSecret(p.api_key), api_secret: p.api_secret ? "set" : null }));

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

    const serviceClient = createServiceClient();
    const { data, error } = await serviceClient
      .from("providers")
      .insert({
        user_id: user.id,
        type,
        api_key: String(api_key).trim(),
        api_secret: secret,
      })
      .select()
      .single();

    if (error) throw error;

    if (setup) setup.webhooks = await configureTelnyxWebhooks(data.api_key, telnyxWebhookUrl());

    return NextResponse.json(
      {
        provider: { ...data, api_key: maskSecret(data.api_key), api_secret: data.api_secret ? "set" : null },
        ...(setup ? { setup } : {}),
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Create provider error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
