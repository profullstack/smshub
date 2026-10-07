/**
 * Telnyx number inventory for managed numbers: find one, buy it onto the smshub
 * messaging profile, and give it back when the rental ends.
 *
 * Buying costs real money, so it only happens in MANAGED_NUMBERS_MODE=live. In
 * test mode a number we already own (TELNYX_TEST_NUMBERS) is lent instead and is
 * never released back to Telnyx. A number is only ever deleted from the Telnyx
 * account if it carries the MANAGED_TAG we put on every number we bought, so a
 * bug here cannot give away a support line.
 */

export const MANAGED_TAG = "smshub-managed";
const API = "https://api.telnyx.com/v2";

export type ManagedMode = "off" | "test" | "live";

export function managedMode(env: NodeJS.ProcessEnv = process.env): ManagedMode {
  const m = String(env.MANAGED_NUMBERS_MODE || "off").toLowerCase();
  return m === "live" || m === "test" ? m : "off";
}

export interface TelnyxConfig {
  apiKey: string;
  messagingProfileId: string;
}

export function telnyxConfig(env: NodeJS.ProcessEnv = process.env): TelnyxConfig | null {
  const apiKey = env.TELNYX_API_KEY || "";
  const messagingProfileId = env.TELNYX_MESSAGING_PROFILE_ID || "";
  if (!apiKey) return null;
  return { apiKey, messagingProfileId };
}

export function testNumberPool(env: NodeJS.ProcessEnv = process.env): string[] {
  return String(env.TELNYX_TEST_NUMBERS || "")
    .split(",")
    .map((n) => n.trim())
    .filter((n) => /^\+\d{8,15}$/.test(n));
}

export class TelnyxError extends Error {}

async function call<T>(
  cfg: TelnyxConfig,
  method: string,
  path: string,
  body: unknown,
  fetchImpl: typeof fetch
): Promise<T> {
  const res = await fetchImpl(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as {
    data?: unknown;
    errors?: { detail?: string; title?: string }[];
  };
  if (!res.ok) {
    const e = json.errors?.[0];
    throw new TelnyxError(e?.detail || e?.title || `Telnyx answered ${res.status}`);
  }
  return json.data as T;
}

/** A US/CA area code is three digits; anything else searches the whole country. */
export function cleanAreaCode(area: unknown): string | null {
  const a = String(area ?? "").replace(/\D/g, "");
  return /^[2-9]\d{2}$/.test(a) ? a : null;
}

export async function findAvailableNumber(
  cfg: TelnyxConfig,
  opts: { country: string; areaCode: string | null },
  fetchImpl: typeof fetch = fetch
): Promise<string> {
  const q = new URLSearchParams({
    "filter[country_code]": opts.country,
    "filter[features][]": "sms",
    "filter[phone_number_type]": "local",
    "filter[limit]": "1",
    "filter[best_effort]": "true",
  });
  if (opts.areaCode) q.set("filter[national_destination_code]", opts.areaCode);
  const data = await call<{ phone_number: string }[]>(
    cfg,
    "GET",
    `/available_phone_numbers?${q}`,
    undefined,
    fetchImpl
  );
  const n = data?.[0]?.phone_number;
  if (!n) throw new TelnyxError(`No ${opts.country} numbers with SMS are available right now`);
  return n;
}

export interface PurchasedNumber {
  number: string;
  orderId: string;
  numberId: string | null;
}

/** Buy one number onto the smshub messaging profile. LIVE MODE ONLY: this spends money. */
export async function purchaseNumber(
  cfg: TelnyxConfig,
  number: string,
  customerReference: string,
  fetchImpl: typeof fetch = fetch
): Promise<PurchasedNumber> {
  if (!cfg.messagingProfileId) throw new TelnyxError("TELNYX_MESSAGING_PROFILE_ID is not set");
  const order = await call<{ id: string; phone_numbers?: { id?: string; phone_number: string }[] }>(
    cfg,
    "POST",
    "/number_orders",
    {
      phone_numbers: [{ phone_number: number }],
      messaging_profile_id: cfg.messagingProfileId,
      customer_reference: customerReference,
    },
    fetchImpl
  );
  const numberId = await lookupNumberId(cfg, number, fetchImpl).catch(() => null);
  if (numberId) {
    await call(cfg, "PATCH", `/phone_numbers/${numberId}`, { tags: [MANAGED_TAG], customer_reference: customerReference }, fetchImpl).catch(
      () => undefined
    );
  }
  return { number, orderId: order.id, numberId };
}

export async function lookupNumberId(
  cfg: TelnyxConfig,
  number: string,
  fetchImpl: typeof fetch = fetch
): Promise<string | null> {
  const q = new URLSearchParams({ "filter[phone_number]": number });
  const data = await call<{ id: string; phone_number: string }[]>(cfg, "GET", `/phone_numbers?${q}`, undefined, fetchImpl);
  return data?.find((d) => d.phone_number === number)?.id ?? null;
}

/**
 * Give a bought number back to Telnyx. Refuses any number without MANAGED_TAG,
 * which is every number we did not buy for a rental.
 */
export async function releaseNumber(
  cfg: TelnyxConfig,
  numberId: string,
  fetchImpl: typeof fetch = fetch
): Promise<void> {
  const n = await call<{ id: string; tags?: string[]; phone_number: string }>(
    cfg,
    "GET",
    `/phone_numbers/${numberId}`,
    undefined,
    fetchImpl
  );
  if (!n?.tags?.includes(MANAGED_TAG)) {
    throw new TelnyxError(`Refusing to release ${n?.phone_number ?? numberId}: not tagged ${MANAGED_TAG}`);
  }
  await call(cfg, "DELETE", `/phone_numbers/${numberId}`, undefined, fetchImpl);
}
