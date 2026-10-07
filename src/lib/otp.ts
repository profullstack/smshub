/**
 * Pull a one-time code out of a text. Prefers a number next to a word like
 * "code", then any 4-8 digit run (also "123-456" / "123 456"). Null if none.
 * No imports, so the browser can use it too.
 */
export function extractOtp(body: string | null | undefined): string | null {
  if (!body) return null;
  const text = String(body);
  const near =
    /(?:code|otp|pin|passcode|verification|verify|token|código|код)[^0-9]{0,24}(\d{3}[- ]?\d{3}|\d{4,8})/i.exec(text) ||
    /(\d{3}[- ]?\d{3}|\d{4,8})[^0-9]{0,24}(?:is your|is the|est votre|es tu)/i.exec(text);
  const raw = near?.[1] ?? /(?<![\d.,:/])(\d{3}[- ]\d{3}|\d{4,8})(?![\d.,:/])/.exec(text)?.[1];
  return raw ? raw.replace(/[- ]/g, "") : null;
}
