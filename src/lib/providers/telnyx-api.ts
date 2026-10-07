// Thin client for the parts of the Telnyx v2 API that provider setup needs:
// the account's webhook signing key, its messaging profiles and which profile
// each number belongs to. Every call uses the customer's own API key.

const TELNYX_API = "https://api.telnyx.com/v2";

export interface TelnyxApiError {
  status: number;
  code: string | null;
  message: string;
}

export type TelnyxResult<T> = { ok: true; data: T } | { ok: false; error: TelnyxApiError };

export interface TelnyxMessagingProfile {
  id: string;
  name: string;
  webhook_url: string | null;
  enabled: boolean;
}

export interface TelnyxMessagingNumber {
  phone_number: string;
  messaging_profile_id: string | null;
  type: string | null;
}

export async function telnyxRequest<T = Record<string, unknown>>(
  apiKey: string,
  method: "GET" | "POST" | "PATCH",
  path: string,
  body?: unknown
): Promise<TelnyxResult<T>> {
  try {
    const response = await fetch(`${TELNYX_API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      const err = (json.errors as Array<Record<string, unknown>> | undefined)?.[0];
      const title = typeof err?.title === "string" ? err.title : "";
      const detail = typeof err?.detail === "string" ? err.detail : "";
      return {
        ok: false,
        error: {
          status: response.status,
          code: err?.code != null ? String(err.code) : null,
          message: title && detail && title !== detail ? `${title}: ${detail}` : title || detail || `HTTP ${response.status}`,
        },
      };
    }
    return { ok: true, data: json as T };
  } catch (error) {
    return {
      ok: false,
      error: { status: 0, code: null, message: error instanceof Error ? error.message : "Network error" },
    };
  }
}

/** The bare base64 Ed25519 key Telnyx signs this account's webhooks with. */
export async function fetchTelnyxPublicKey(apiKey: string): Promise<TelnyxResult<string>> {
  const res = await telnyxRequest<{ data?: { public?: string } }>(apiKey, "GET", "/public_key");
  if (!res.ok) return res;
  const key = res.data.data?.public;
  if (!key) return { ok: false, error: { status: 200, code: null, message: "Telnyx returned no public key" } };
  return { ok: true, data: key };
}

// Lists are paged at 250; a handful of pages covers any realistic account.
async function listAll<T>(apiKey: string, path: string, maxPages = 8): Promise<TelnyxResult<T[]>> {
  const rows: T[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const sep = path.includes("?") ? "&" : "?";
    const res = await telnyxRequest<{ data?: T[]; meta?: { total_pages?: number } }>(
      apiKey,
      "GET",
      `${path}${sep}page[size]=250&page[number]=${page}`
    );
    if (!res.ok) return res;
    rows.push(...(res.data.data ?? []));
    if (!res.data.meta?.total_pages || page >= res.data.meta.total_pages) break;
  }
  return { ok: true, data: rows };
}

export async function listMessagingProfiles(apiKey: string): Promise<TelnyxResult<TelnyxMessagingProfile[]>> {
  const res = await listAll<Record<string, unknown>>(apiKey, "/messaging_profiles");
  if (!res.ok) return res;
  return {
    ok: true,
    data: res.data.map((p) => ({
      id: String(p.id),
      name: String(p.name ?? ""),
      webhook_url: typeof p.webhook_url === "string" && p.webhook_url ? p.webhook_url : null,
      enabled: p.enabled !== false,
    })),
  };
}

export async function listMessagingNumbers(apiKey: string): Promise<TelnyxResult<TelnyxMessagingNumber[]>> {
  const res = await listAll<Record<string, unknown>>(apiKey, "/phone_numbers/messaging");
  if (!res.ok) return res;
  return {
    ok: true,
    data: res.data.map((n) => ({
      phone_number: String(n.phone_number ?? ""),
      messaging_profile_id:
        typeof n.messaging_profile_id === "string" && n.messaging_profile_id ? n.messaging_profile_id : null,
      type: typeof n.type === "string" ? n.type : null,
    })),
  };
}

export function sameWebhookUrl(a: string | null | undefined, b: string): boolean {
  if (!a) return false;
  return a.trim().replace(/\/+$/, "").toLowerCase() === b.trim().replace(/\/+$/, "").toLowerCase();
}

export type ProfileAction = "updated" | "already_set" | "points_elsewhere" | "failed";

export interface ProfileWebhookResult {
  profileId: string;
  profileName: string;
  numbers: string[];
  previousUrl: string | null;
  action: ProfileAction;
  error?: TelnyxApiError;
}

export interface ConfigureWebhooksResult {
  ok: boolean;
  webhookUrl: string;
  profiles: ProfileWebhookResult[];
  numbersWithoutProfile: string[];
  error?: TelnyxApiError;
}

/**
 * Point the messaging profiles that own the account's numbers at smshub.
 *
 * A profile whose webhook already goes somewhere else is left alone unless
 * `force` is set: the same Telnyx account often feeds other apps, and
 * silently stealing their inbound SMS would be worse than one extra click.
 * `onlyNumbers` narrows the change to the profiles owning those numbers.
 */
export async function configureTelnyxWebhooks(
  apiKey: string,
  webhookUrl: string,
  options: { force?: boolean; onlyNumbers?: string[] } = {}
): Promise<ConfigureWebhooksResult> {
  const [profilesRes, numbersRes] = await Promise.all([listMessagingProfiles(apiKey), listMessagingNumbers(apiKey)]);
  if (!profilesRes.ok) return { ok: false, webhookUrl, profiles: [], numbersWithoutProfile: [], error: profilesRes.error };
  if (!numbersRes.ok) return { ok: false, webhookUrl, profiles: [], numbersWithoutProfile: [], error: numbersRes.error };

  const wanted = options.onlyNumbers?.length ? new Set(options.onlyNumbers) : null;
  const numbers = numbersRes.data.filter((n) => !wanted || wanted.has(n.phone_number));

  const byProfile = new Map<string, string[]>();
  const numbersWithoutProfile: string[] = [];
  for (const n of numbers) {
    if (!n.messaging_profile_id) {
      numbersWithoutProfile.push(n.phone_number);
      continue;
    }
    byProfile.set(n.messaging_profile_id, [...(byProfile.get(n.messaging_profile_id) ?? []), n.phone_number]);
  }

  const profiles: ProfileWebhookResult[] = [];
  for (const [profileId, profileNumbers] of byProfile) {
    const profile = profilesRes.data.find((p) => p.id === profileId);
    const base = {
      profileId,
      profileName: profile?.name ?? profileId,
      numbers: profileNumbers,
      previousUrl: profile?.webhook_url ?? null,
    };
    if (sameWebhookUrl(profile?.webhook_url, webhookUrl)) {
      profiles.push({ ...base, action: "already_set" });
      continue;
    }
    if (profile?.webhook_url && !options.force) {
      profiles.push({ ...base, action: "points_elsewhere" });
      continue;
    }
    const patch = await telnyxRequest(apiKey, "PATCH", `/messaging_profiles/${encodeURIComponent(profileId)}`, {
      webhook_url: webhookUrl,
      webhook_api_version: "2",
    });
    profiles.push(patch.ok ? { ...base, action: "updated" } : { ...base, action: "failed", error: patch.error });
  }

  return {
    ok: profiles.every((p) => p.action === "updated" || p.action === "already_set"),
    webhookUrl,
    profiles,
    numbersWithoutProfile,
  };
}
