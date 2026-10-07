import { NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceClient } from "@/lib/supabase/server";
import { configureTelnyxWebhooks, fetchTelnyxPublicKey, type ConfigureWebhooksResult } from "@/lib/providers/telnyx-api";
import { telnyxWebhookUrl } from "@/lib/providers/provider-check";

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

    return NextResponse.json({ providers: data });
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
    const { type, api_key, api_secret, public_key } = body;

    if (!type || !api_key) {
      return NextResponse.json({ error: "type and api_key are required" }, { status: 400 });
    }

    // Telnyx: check the key, fetch the account's webhook signing key, and
    // point the messaging profiles at smshub so nobody has to do it by hand.
    let metadata: Record<string, unknown> | null = null;
    let setup: { publicKey: "fetched" | "entered" | "missing"; publicKeyError?: string; webhooks?: ConfigureWebhooksResult } | undefined;
    if (type === "telnyx") {
      const key = await fetchTelnyxPublicKey(String(api_key).trim());
      if (!key.ok && (key.error.status === 401 || key.error.status === 403)) {
        return NextResponse.json(
          { error: `Telnyx rejected this API key: ${key.error.message}`, code: key.error.code },
          { status: 400 }
        );
      }
      const entered = typeof public_key === "string" && public_key.trim() ? public_key.trim() : null;
      const publicKey = entered ?? (key.ok ? key.data : null);
      metadata = publicKey ? { public_key: publicKey } : null;
      setup = {
        publicKey: entered ? "entered" : publicKey ? "fetched" : "missing",
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
        api_secret: api_secret || null,
        metadata,
      })
      .select()
      .single();

    if (error) throw error;

    if (setup) {
      setup.webhooks = await configureTelnyxWebhooks(data.api_key, telnyxWebhookUrl());
      return NextResponse.json({ provider: data, setup }, { status: 201 });
    }

    return NextResponse.json({ provider: data }, { status: 201 });
  } catch (error) {
    console.error("Create provider error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
