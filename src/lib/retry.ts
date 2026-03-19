/**
 * Generic retry utility with exponential backoff.
 */
export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

export interface RetryResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  attempts: number;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function getBackoffDelay(attempt: number, baseDelayMs: number, maxDelayMs: number): number {
  const delay = baseDelayMs * Math.pow(2, attempt);
  return Math.min(delay, maxDelayMs);
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions
): Promise<RetryResult<T>> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: string | undefined;

  for (let attempt = 0; attempt < opts.maxAttempts; attempt++) {
    try {
      const data = await fn();
      return { success: true, data, attempts: attempt + 1 };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      if (attempt < opts.maxAttempts - 1) {
        const delay = getBackoffDelay(attempt, opts.baseDelayMs, opts.maxDelayMs);
        await sleep(delay);
      }
    }
  }

  return { success: false, error: lastError, attempts: opts.maxAttempts };
}
