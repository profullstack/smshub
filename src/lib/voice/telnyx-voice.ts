/**
 * Telnyx voice for a line: the Call Control application whose webhook is
 * smshub's voice menu, pointing a number at it, and the call commands the menu
 * issues (answer, gather, transfer, hangup).
 *
 * Nothing here buys anything. A Call Control application is free; a call that
 * is answered and transferred is billed per minute by Telnyx to the account
 * that owns the number, like any call to it.
 */

import { telnyxRequest, type TelnyxApiError, type TelnyxResult } from "@/lib/providers/telnyx-api";
import { getSiteUrl } from "@/lib/site-url";

export const VOICE_APP_NAME = "smshub voice menu";

export const voiceWebhookUrl = () => `${getSiteUrl()}/api/webhooks/telnyx/voice`;

const sameUrl = (a: string | null | undefined, b: string) =>
  Boolean(a) && a!.trim().replace(/\/+$/, "").toLowerCase() === b.trim().replace(/\/+$/, "").toLowerCase();

export interface VoiceStatus {
  ok: boolean;
  /** configured: calls reach the menu. not_configured: the number has no voice connection. points_elsewhere: another connection takes its calls. */
  state: "configured" | "not_configured" | "points_elsewhere" | "error";
  number: string;
  webhookUrl: string;
  applicationId: string | null;
  connectionId: string | null;
  connectionName: string | null;
  action?: "created_application" | "assigned" | "already_set" | "refused";
  error?: TelnyxApiError;
  message: string;
}

interface CallControlApp {
  id: string;
  application_name: string;
  webhook_event_url: string | null;
}

async function findVoiceApp(apiKey: string, webhookUrl: string): Promise<TelnyxResult<CallControlApp | null>> {
  const res = await telnyxRequest<{ data?: CallControlApp[] }>(apiKey, "GET", "/call_control_applications?page[size]=250");
  if (!res.ok) return res;
  const apps = res.data.data ?? [];
  return { ok: true, data: apps.find((a) => sameUrl(a.webhook_event_url, webhookUrl)) ?? null };
}

async function connectionName(apiKey: string, connectionId: string): Promise<string | null> {
  const res = await telnyxRequest<{ data?: { connection_name?: string; application_name?: string } }>(
    apiKey,
    "GET",
    `/connections/${encodeURIComponent(connectionId)}`
  );
  if (!res.ok) return null;
  return res.data.data?.connection_name || res.data.data?.application_name || null;
}

interface TelnyxNumber {
  id: string;
  phone_number: string;
  connection_id: string | null;
}

async function findNumber(apiKey: string, number: string): Promise<TelnyxResult<TelnyxNumber | null>> {
  const res = await telnyxRequest<{ data?: Array<Record<string, unknown>> }>(
    apiKey,
    "GET",
    `/phone_numbers?filter[phone_number]=${encodeURIComponent(number)}`
  );
  if (!res.ok) return res;
  const row = (res.data.data ?? []).find((n) => n.phone_number === number);
  if (!row) return { ok: true, data: null };
  return {
    ok: true,
    data: {
      id: String(row.id),
      phone_number: String(row.phone_number),
      connection_id: typeof row.connection_id === "string" && row.connection_id ? row.connection_id : null,
    },
  };
}

/**
 * Where a number's calls go now, and (with `apply`) point it at the voice
 * menu: find or create the "smshub voice menu" Call Control application and
 * set it as the number's connection. A number whose calls already go to
 * another connection (a SIP trunk, another app) is left alone unless `force`,
 * the same rule the SMS webhook setup follows.
 */
export async function configureVoice(
  apiKey: string,
  number: string,
  options: { apply?: boolean; force?: boolean } = {}
): Promise<VoiceStatus> {
  const webhookUrl = voiceWebhookUrl();
  const base = { number, webhookUrl, applicationId: null, connectionId: null, connectionName: null };
  const fail = (error: TelnyxApiError, message: string): VoiceStatus => ({ ...base, ok: false, state: "error", error, message });

  const [appRes, numRes] = await Promise.all([findVoiceApp(apiKey, webhookUrl), findNumber(apiKey, number)]);
  if (!appRes.ok) return fail(appRes.error, `Telnyx refused the call control lookup: ${appRes.error.message}`);
  if (!numRes.ok) return fail(numRes.error, `Telnyx refused the number lookup: ${numRes.error.message}`);
  const tn = numRes.data;
  if (!tn) {
    return fail({ status: 404, code: null, message: "not on this account" }, `${number} is not on this Telnyx account`);
  }

  let app = appRes.data;
  const current = tn.connection_id;
  const status = { ...base, applicationId: app?.id ?? null, connectionId: current };

  if (app && current === app.id) {
    return { ...status, ok: true, state: "configured", action: "already_set", message: "Calls to this number play the voice menu." };
  }
  const elsewhere = Boolean(current);
  const name = elsewhere ? await connectionName(apiKey, current!) : null;
  if (!options.apply || (elsewhere && !options.force)) {
    return {
      ...status,
      connectionName: name,
      ok: false,
      state: elsewhere ? "points_elsewhere" : "not_configured",
      action: options.apply ? "refused" : undefined,
      message: elsewhere
        ? `Calls to this number go to "${name ?? current}" on Telnyx. Replace it to use the voice menu.`
        : "Calls to this number are not answered yet.",
    };
  }

  let action: VoiceStatus["action"] = "assigned";
  if (!app) {
    const created = await telnyxRequest<{ data?: CallControlApp }>(apiKey, "POST", "/call_control_applications", {
      application_name: VOICE_APP_NAME,
      webhook_event_url: webhookUrl,
      webhook_api_version: "2",
    });
    if (!created.ok || !created.data.data?.id) {
      const error = created.ok ? { status: 200, code: null, message: "no application id" } : created.error;
      return fail(error, `Could not create the call control application: ${error.message}`);
    }
    app = created.data.data;
    action = "created_application";
  }

  const patch = await telnyxRequest(apiKey, "PATCH", `/phone_numbers/${encodeURIComponent(tn.id)}`, { connection_id: app.id });
  if (!patch.ok) return fail(patch.error, `Could not point ${number} at the voice menu: ${patch.error.message}`);
  return {
    ...base,
    ok: true,
    state: "configured",
    applicationId: app.id,
    connectionId: app.id,
    connectionName: VOICE_APP_NAME,
    action,
    message: "Calls to this number now play the voice menu.",
  };
}

// ---- call commands -------------------------------------------------------

export type CallCommand = (
  callControlId: string,
  action: "answer" | "gather_using_speak" | "speak" | "transfer" | "hangup",
  body: Record<string, unknown>
) => Promise<TelnyxResult<unknown>>;

export function telnyxCallCommand(apiKey: string): CallCommand {
  return (callControlId, action, body) =>
    telnyxRequest(apiKey, "POST", `/calls/${encodeURIComponent(callControlId)}/actions/${action}`, body);
}

export const encodeState = (state: Record<string, unknown>) => Buffer.from(JSON.stringify(state)).toString("base64");

export function decodeState(raw: unknown): Record<string, unknown> | null {
  if (typeof raw !== "string" || !raw) return null;
  try {
    const v = JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
    return v && typeof v === "object" && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}
