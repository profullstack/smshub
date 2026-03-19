import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetUser = vi.fn();
const mockFrom = vi.fn();
const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockSingle = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  })),
}));

vi.mock("@/lib/providers", () => ({
  sendSMS: vi.fn(async () => ({ success: true, messageId: "SM_BULK_1" })),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true, remaining: 9 })),
}));

describe("POST /api/messages/bulk-send", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Chain: from().select().eq().single()
    mockSingle.mockResolvedValue({ data: { id: "phone-1", number: "+1000", provider_id: "prov-1" }, error: null });
    mockEq.mockReturnValue({ single: mockSingle, eq: mockEq });
    mockSelect.mockReturnValue({ eq: mockEq, single: mockSingle });
    mockInsert.mockReturnValue({ select: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { id: "new-1" }, error: null }) }) });
    mockUpdate.mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) });

    mockFrom.mockImplementation((table: string) => {
      if (table === "phone_numbers") {
        return { select: mockSelect };
      }
      if (table === "providers") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: "prov-1", type: "twilio", api_key: "key", api_secret: "secret" },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "contacts") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: { id: "contact-1" }, error: null }),
              }),
            }),
          }),
          insert: mockInsert,
        };
      }
      if (table === "conversations") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: { id: "conv-1" }, error: null }),
                }),
              }),
            }),
          }),
          insert: mockInsert,
          update: mockUpdate,
        };
      }
      if (table === "messages") {
        return { insert: vi.fn().mockResolvedValue({ error: null }) };
      }
      return { select: mockSelect, insert: mockInsert, update: mockUpdate };
    });
  });

  it("returns 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const { POST } = await import("@/app/api/messages/bulk-send/route");
    const request = new Request("http://localhost/api/messages/bulk-send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipients: ["+1111"], phoneNumberId: "p1", message: "hi" }),
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it("returns 400 when recipients is missing", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });

    const { POST } = await import("@/app/api/messages/bulk-send/route");
    const request = new Request("http://localhost/api/messages/bulk-send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phoneNumberId: "p1", message: "hi" }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it("returns 400 when recipients exceeds 100", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });

    const { POST } = await import("@/app/api/messages/bulk-send/route");
    const recipients = Array.from({ length: 101 }, (_, i) => `+100000${i}`);
    const request = new Request("http://localhost/api/messages/bulk-send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipients, phoneNumberId: "p1", message: "hi" }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });
});
