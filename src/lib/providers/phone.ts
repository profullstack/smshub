/**
 * Normalize a user-typed phone number to E.164 (+15551234567).
 * Bare 10-digit numbers are assumed to be US/Canada. Returns null when the
 * input is not a single plausible number (e.g. "555-1234, 555-9876").
 */
export function toE164(input: string): string | null {
  const raw = String(input ?? "").trim();
  if (!raw || /[,;\/]/.test(raw)) return null;

  const stripped = raw.replace(/[\s().\-]/g, "");
  const hasPlus = stripped.startsWith("+");
  const digits = hasPlus ? stripped.slice(1) : stripped.replace(/^00/, "");
  if (!/^\d+$/.test(digits)) return null;

  if (!hasPlus && digits.length === 10) return `+1${digits}`;
  if (digits.length < 8 || digits.length > 15 || digits.startsWith("0")) return null;
  return `+${digits}`;
}
