import { expect, test } from "@playwright/test";

test("/inbox response CSP allows Supabase Realtime websocket", async ({ request }) => {
  const response = await request.get("/inbox", { maxRedirects: 0 });

  expect([200, 307, 308]).toContain(response.status());

  const csp = response.headers()["content-security-policy"];

  expect(csp).toBeDefined();
  expect(csp).toContain("connect-src 'self' https:");
  expect(csp).toContain("wss://sytajbytcdlsbnbkqpyo.supabase.co");
  expect(csp).not.toContain("connect-src *");
});
