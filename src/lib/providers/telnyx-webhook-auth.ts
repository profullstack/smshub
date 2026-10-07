import type { SupabaseClient } from "@supabase/supabase-js";
import { verifyTelnyxSignature } from "./telnyx";
import { fetchTelnyxPublicKey } from "./telnyx-api";
import { toE164 } from "./phone";

// Telnyx signs every webhook with the sending *account's* Ed25519 key. One
// global TELNYX_PUBLIC_KEY only covers smshub's own account, so a customer who
// brings their own Telnyx key would get every webhook rejected. Instead we
// find the providers that own a number in the event and try each one's key
// (stored in providers.metadata.public_key, fetched from GET /v2/public_key on
// first use), plus the global key for smshub's own numbers.

export interface TelnyxKeyCandidate {
  key: string;
  /** null for the global TELNYX_PUBLIC_KEY */
  providerId: string | null;
}

export interface TelnyxWebhookAuth {
  ok: boolean;
  /** The provider whose key verified the event, when it was not the global key. */
  providerId: string | null;
  /** How many keys were available to check; 0 means verification is off (dev). */
  candidates: number;
}

interface ProviderKeyRow {
  id: string;
  api_key: string;
  metadata: Record<string, unknown> | null;
}

/** Every phone number an event mentions: from plus each recipient. */
export function telnyxEventNumbers(body: Record<string, unknown>): string[] {
  const data = body.data as Record<string, unknown> | undefined;
  const payload = data?.payload as Record<string, unknown> | undefined;
  const raw: unknown[] = [(payload?.from as Record<string, unknown> | undefined)?.phone_number];
  for (const to of (payload?.to as Array<Record<string, unknown>> | undefined) ?? []) raw.push(to?.phone_number);
  return [...new Set(raw.filter((n): n is string => typeof n === "string" && !!n))];
}

/** The spellings a number may have been saved under in phone_numbers.number. */
export function numberVariants(numbers: string[]): string[] {
  const out = new Set<string>();
  for (const n of numbers) {
    out.add(n);
    const e164 = toE164(n);
    if (!e164) continue;
    out.add(e164);
    out.add(e164.slice(1));
    if (e164.startsWith("+1") && e164.length === 12) out.add(e164.slice(2));
  }
  return [...out];
}

export function storedPublicKey(metadata: Record<string, unknown> | null | undefined): string | null {
  const key = metadata?.public_key;
  return typeof key === "string" && key ? key : null;
}

export async function telnyxKeyCandidates(
  supabase: SupabaseClient,
  body: Record<string, unknown>
): Promise<TelnyxKeyCandidate[]> {
  const candidates: TelnyxKeyCandidate[] = [];
  if (process.env.TELNYX_PUBLIC_KEY) candidates.push({ key: process.env.TELNYX_PUBLIC_KEY, providerId: null });

  const numbers = numberVariants(telnyxEventNumbers(body));
  if (!numbers.length) return candidates;

  try {
    const { data: rows } = await supabase
      .from("phone_numbers")
      .select("provider_id, providers!inner(id, type, api_key, metadata)")
      .in("number", numbers)
      .eq("providers.type", "telnyx");

    const providers = new Map<string, ProviderKeyRow>();
    for (const row of (rows ?? []) as Array<{ providers: ProviderKeyRow | ProviderKeyRow[] | null }>) {
      const list = Array.isArray(row.providers) ? row.providers : row.providers ? [row.providers] : [];
      for (const p of list) providers.set(p.id, p);
    }

    for (const p of providers.values()) {
      let key = storedPublicKey(p.metadata);
      if (!key) {
        // Providers saved before per-account keys existed: fetch once, keep it.
        const fetched = await fetchTelnyxPublicKey(p.api_key);
        if (fetched.ok) {
          key = fetched.data;
          await supabase
            .from("providers")
            .update({ metadata: { ...(p.metadata ?? {}), public_key: key } })
            .eq("id", p.id);
        }
      }
      if (key && !candidates.some((c) => c.key === key && c.providerId === p.id)) {
        candidates.push({ key, providerId: p.id });
      }
    }
  } catch (error) {
    console.error("Telnyx key lookup failed:", error);
  }
  return candidates;
}

export async function authenticateTelnyxWebhook(
  supabase: SupabaseClient,
  rawBody: string,
  body: Record<string, unknown>,
  headers: Headers
): Promise<TelnyxWebhookAuth> {
  const candidates = await telnyxKeyCandidates(supabase, body);
  // No key anywhere: local dev without TELNYX_PUBLIC_KEY, same as before.
  if (!candidates.length) return { ok: true, providerId: null, candidates: 0 };

  // Prefer a provider's own key so the event is tied to that provider.
  const ordered = [...candidates.filter((c) => c.providerId), ...candidates.filter((c) => !c.providerId)];
  for (const c of ordered) {
    if (verifyTelnyxSignature(rawBody, headers, c.key)) {
      return { ok: true, providerId: c.providerId, candidates: candidates.length };
    }
  }
  return { ok: false, providerId: null, candidates: candidates.length };
}
