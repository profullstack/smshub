/**
 * Sliding window rate limiter using in-memory Map.
 */

interface RateLimitEntry {
  timestamps: number[];
}

const store = new Map<string, RateLimitEntry>();

// Cleanup stale entries every 5 minutes
const CLEANUP_INTERVAL = 5 * 60 * 1000;
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

function startCleanup(windowMs: number) {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store.entries()) {
      entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs);
      if (entry.timestamps.length === 0) {
        store.delete(key);
      }
    }
  }, CLEANUP_INTERVAL);
  // Don't block Node from exiting
  if (cleanupTimer && typeof cleanupTimer === "object" && "unref" in cleanupTimer) {
    cleanupTimer.unref();
  }
}

export interface RateLimitConfig {
  /** Max requests in the window */
  limit: number;
  /** Window size in milliseconds */
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs?: number;
}

export function checkRateLimit(key: string, config: RateLimitConfig): RateLimitResult {
  startCleanup(config.windowMs);

  const now = Date.now();
  let entry = store.get(key);
  if (!entry) {
    entry = { timestamps: [] };
    store.set(key, entry);
  }

  // Remove timestamps outside the window
  entry.timestamps = entry.timestamps.filter((t) => now - t < config.windowMs);

  if (entry.timestamps.length >= config.limit) {
    const oldest = entry.timestamps[0];
    const retryAfterMs = config.windowMs - (now - oldest);
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: Math.max(retryAfterMs, 1),
    };
  }

  entry.timestamps.push(now);
  return {
    allowed: true,
    remaining: config.limit - entry.timestamps.length,
  };
}

/**
 * Reset rate limit store (for testing).
 */
export function resetRateLimitStore(): void {
  store.clear();
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}
