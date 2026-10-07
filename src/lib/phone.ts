/** "+1 (415) 555-0123" -> "+14155550123"; null unless it is a plausible E.164 number. */
export function normalizeE164(input: unknown): string | null {
  const digits = String(input ?? "").replace(/[^\d+]/g, "");
  const n = digits.startsWith("+") ? "+" + digits.slice(1).replace(/\+/g, "") : null;
  return n && /^\+[1-9]\d{7,14}$/.test(n) ? n : null;
}
