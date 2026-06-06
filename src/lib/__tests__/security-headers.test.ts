import { afterEach, describe, expect, it, vi } from "vitest";

async function loadCspHeader(supabaseUrl: string) {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", supabaseUrl);

  const { default: nextConfig } = await import("../../../next.config");
  expect(typeof nextConfig.headers).toBe("function");

  const headerRoutes = await nextConfig.headers!();
  const csp = headerRoutes[0]?.headers.find(
    (header) => header.key === "Content-Security-Policy"
  )?.value;

  expect(csp).toBeDefined();
  return csp!;
}

describe("Security headers config", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("serves required security headers", async () => {
    vi.resetModules();

    const { default: nextConfig } = await import("../../../next.config");
    expect(typeof nextConfig.headers).toBe("function");

    const headerRoutes = await nextConfig.headers!();
    const headers = headerRoutes.flatMap((route) => route.headers);

    expect(headers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "Content-Security-Policy" }),
        expect.objectContaining({ key: "X-Frame-Options" }),
        expect.objectContaining({ key: "X-Content-Type-Options" }),
        expect.objectContaining({ key: "Referrer-Policy" }),
        expect.objectContaining({ key: "Strict-Transport-Security" }),
      ])
    );
  });

  it("allows the configured Supabase Realtime websocket origin in CSP", async () => {
    const csp = await loadCspHeader(
      "https://sytajbytcdlsbnbkqpyo.supabase.co"
    );

    expect(csp).toContain("connect-src 'self' https:");
    expect(csp).toContain("wss://sytajbytcdlsbnbkqpyo.supabase.co");
    expect(csp).not.toContain("connect-src *");
  });

  it("falls back to a scoped Supabase websocket origin when env is missing", async () => {
    const csp = await loadCspHeader("");

    expect(csp).toContain("connect-src 'self' https:");
    expect(csp).toContain("wss://*.supabase.co");
    expect(csp).not.toContain("connect-src *");
  });
});
