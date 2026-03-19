import * as Sentry from "@sentry/nextjs";
import { NextRequest, NextResponse } from "next/server";

/**
 * Initialize Sentry with environment detection.
 * Called automatically via sentry.*.config.ts files.
 */
export function getEnvironment(): string {
  if (process.env.SENTRY_ENVIRONMENT) {
    return process.env.SENTRY_ENVIRONMENT;
  }
  if (process.env.RAILWAY_ENVIRONMENT) {
    return process.env.RAILWAY_ENVIRONMENT;
  }
  if (process.env.VERCEL_ENV) {
    return process.env.VERCEL_ENV;
  }
  return process.env.NODE_ENV || "development";
}

/**
 * Capture an exception with optional context.
 */
export function captureError(
  error: unknown,
  context?: Record<string, unknown>
) {
  Sentry.captureException(error, {
    extra: context,
  });
}

/**
 * Set user context for Sentry tracking.
 */
export function setUser(user: { id: string; email?: string }) {
  Sentry.setUser(user);
}

/**
 * Clear user context (on logout).
 */
export function clearUser() {
  Sentry.setUser(null);
}

/**
 * Wrap an API route handler with Sentry error boundary.
 * Catches unhandled errors, reports them to Sentry, and returns a 500 response.
 */
export function withSentryApiRoute(
  handler: (req: NextRequest) => Promise<NextResponse>
) {
  return async (req: NextRequest): Promise<NextResponse> => {
    try {
      return await handler(req);
    } catch (error) {
      Sentry.captureException(error, {
        extra: {
          url: req.url,
          method: req.method,
        },
      });

      // Flush events before returning
      await Sentry.flush(2000);

      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }
  };
}

/**
 * Create a Sentry transaction for tracking async operations.
 */
export function startSpan<T>(
  name: string,
  op: string,
  fn: () => Promise<T>
): Promise<T> {
  return Sentry.startSpan({ name, op }, fn);
}
