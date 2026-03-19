/**
 * API key authentication for the white-label v1 API.
 * Looks up X-API-Key header, verifies against hashed keys in api_keys table.
 */

import { createHash } from "crypto";
import { createServiceClient } from "@/lib/supabase/server";
import { checkRateLimit, type RateLimitResult } from "@/lib/rate-limit";

export interface ApiKeyUser {
  userId: string;
  keyId: string;
}

/**
 * Hash an API key for storage/lookup.
 */
export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/**
 * Generate a new API key (prefix + random).
 */
export function generateApiKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `smshub_${hex}`;
}

/**
 * Authenticate a request using X-API-Key header.
 * Returns the user info or null if invalid.
 */
export async function authenticateApiKey(
  request: Request
): Promise<ApiKeyUser | null> {
  const apiKey = request.headers.get("X-API-Key");
  if (!apiKey) return null;

  const keyHash = hashApiKey(apiKey);
  const supabase = createServiceClient();

  const { data: keyRecord } = await supabase
    .from("api_keys")
    .select("id, user_id")
    .eq("key_hash", keyHash)
    .single();

  if (!keyRecord) return null;

  // Update last_used_at (fire and forget)
  supabase
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", keyRecord.id)
    .then(() => {});

  return {
    userId: keyRecord.user_id,
    keyId: keyRecord.id,
  };
}

/**
 * Check rate limit for an API key (100 requests per minute).
 */
export function checkApiKeyRateLimit(keyId: string): RateLimitResult {
  return checkRateLimit(`api-key:${keyId}`, {
    limit: 100,
    windowMs: 60 * 1000,
  });
}
