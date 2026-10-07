import type { SupabaseClient } from "@supabase/supabase-js";

export type DeliveryStatus = "sent" | "delivered" | "failed";

export interface TelnyxStatusUpdate {
  messageId: string;
  status: DeliveryStatus;
  errorCode: string | null;
  errorDetail: string | null;
}

// Per-recipient statuses Telnyx reports on a message (payload.to[].status).
// queued/sending/delivery_unconfirmed say nothing new past "accepted", so they
// stay "sent"; only a definite outcome moves the row on.
const RECIPIENT_STATUS: Record<string, DeliveryStatus> = {
  queued: "sent",
  sending: "sent",
  sent: "sent",
  delivery_unconfirmed: "sent",
  delivered: "delivered",
  sending_failed: "failed",
  delivery_failed: "failed",
};

const STATUS_EVENTS = new Set(["message.sent", "message.finalized", "message.delivered", "message.failed"]);

export function isTelnyxStatusEvent(eventType: string | undefined): boolean {
  return !!eventType && STATUS_EVENTS.has(eventType);
}

/**
 * Turn a Telnyx message resource (webhook `data.payload`, or `data` from
 * GET /v2/messages/{id}) into the status smshub stores. Returns null when the
 * payload carries no recognisable status.
 */
export function parseTelnyxMessage(message: Record<string, unknown> | undefined): TelnyxStatusUpdate | null {
  if (!message) return null;
  const messageId = typeof message.id === "string" ? message.id : "";
  if (!messageId) return null;

  const to = message.to as Array<Record<string, unknown>> | undefined;
  const recipientStatus = typeof to?.[0]?.status === "string" ? (to[0].status as string) : "";
  const status = RECIPIENT_STATUS[recipientStatus];
  if (!status) return null;

  const errors = message.errors as Array<Record<string, unknown>> | undefined;
  const err = errors?.[0];
  const errorCode = err?.code != null ? String(err.code) : null;
  const title = typeof err?.title === "string" ? err.title : "";
  const detail = typeof err?.detail === "string" ? err.detail : "";
  const errorDetail = title && detail ? `${title}: ${detail}` : title || detail || null;

  return {
    messageId,
    status,
    errorCode: status === "failed" ? errorCode : null,
    errorDetail: status === "failed" ? errorDetail : null,
  };
}

/** Parse a Telnyx v2 webhook body (message.sent / message.finalized / ...). */
export function parseTelnyxStatusEvent(body: Record<string, unknown>): TelnyxStatusUpdate | null {
  const data = body.data as Record<string, unknown> | undefined;
  if (!isTelnyxStatusEvent(data?.event_type as string | undefined)) return null;
  return parseTelnyxMessage(data?.payload as Record<string, unknown> | undefined);
}

/**
 * Record a delivery outcome on the matching outbound message. A late or
 * replayed message.sent must not undo a final delivered/failed, so "sent"
 * only applies to rows that are still queued or sent.
 */
export async function applyTelnyxStatus(supabase: SupabaseClient, update: TelnyxStatusUpdate) {
  let query = supabase
    .from("messages")
    .update({
      status: update.status,
      error_code: update.errorCode,
      error_detail: update.errorDetail,
      status_updated_at: new Date().toISOString(),
    })
    .eq("provider_message_id", update.messageId)
    .eq("provider", "telnyx");

  if (update.status === "sent") {
    query = query.in("status", ["queued", "sent"]);
  }

  return query;
}
