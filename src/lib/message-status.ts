/** Human-readable reason a message was not delivered, e.g. "Not 10DLC registered: ... (40010)". */
export function failureReason(msg: { error_code?: string | null; error_detail?: string | null }): string | null {
  if (!msg.error_detail && !msg.error_code) return null;
  if (!msg.error_code) return msg.error_detail!;
  return msg.error_detail ? `${msg.error_detail} (${msg.error_code})` : `Error ${msg.error_code}`;
}
