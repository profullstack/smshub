import { describe, it, expect, vi, beforeEach } from "vitest";
import { resetRateLimitStore } from "@/lib/rate-limit";

const mockGetUser = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        }),
      }),
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { id: "new-1" },
            error: null,
          }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    })),
  })),
}));

vi.mock("@/lib/providers", () => ({
  sendSMS: vi.fn(async () => ({ success: true, messageId: "SM1" })),
}));

describe("Rate limiting on /api/messages/send", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimitStore();
  });

  it("returns 429 when rate limit exceeded", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-rl-test" } } });

    // We import fresh each time to avoid module caching issues
    const { POST } = await import("@/app/api/messages/send/route");

    // Exhaust rate limit (10 per minute)
    for (let i = 0; i < 10; i++) {
      await POST(
        new Request("http://localhost/api/messages/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ to: "+1111", phoneNumberId: "p1", message: "test" }),
        })
      );
    }

    // 11th request should be rate limited
    const response = await POST(
      new Request("http://localhost/api/messages/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: "+1111", phoneNumberId: "p1", message: "test" }),
      })
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBeTruthy();
  });
});
