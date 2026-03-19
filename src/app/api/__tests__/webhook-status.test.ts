import { describe, it, expect, vi, beforeEach } from "vitest";

const mockUpdate = vi.fn();
const mockUpdateEq1 = vi.fn();
const mockUpdateEq2 = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: vi.fn(() => ({
    from: vi.fn(() => ({
      update: mockUpdate,
    })),
  })),
}));

mockUpdate.mockReturnValue({ eq: mockUpdateEq1 });
mockUpdateEq1.mockReturnValue({ eq: mockUpdateEq2 });
mockUpdateEq2.mockResolvedValue({ error: null });

describe("POST /api/webhooks/twilio/status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdate.mockReturnValue({ eq: mockUpdateEq1 });
    mockUpdateEq1.mockReturnValue({ eq: mockUpdateEq2 });
    mockUpdateEq2.mockResolvedValue({ error: null });
  });

  it("updates message status for delivered", async () => {
    const { POST } = await import("@/app/api/webhooks/twilio/status/route");

    const body = new URLSearchParams({
      MessageSid: "SM123",
      MessageStatus: "delivered",
    }).toString();

    const request = new Request("http://localhost/api/webhooks/twilio/status", {
      method: "POST",
      body,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith({ status: "delivered" });
  });

  it("updates message status for failed", async () => {
    const { POST } = await import("@/app/api/webhooks/twilio/status/route");

    const body = new URLSearchParams({
      MessageSid: "SM456",
      MessageStatus: "failed",
    }).toString();

    const request = new Request("http://localhost/api/webhooks/twilio/status", {
      method: "POST",
      body,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith({ status: "failed" });
  });

  it("returns 400 for missing fields", async () => {
    const { POST } = await import("@/app/api/webhooks/twilio/status/route");

    const request = new Request("http://localhost/api/webhooks/twilio/status", {
      method: "POST",
      body: "",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });
});

describe("POST /api/webhooks/telnyx/status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdate.mockReturnValue({ eq: mockUpdateEq1 });
    mockUpdateEq1.mockReturnValue({ eq: mockUpdateEq2 });
    mockUpdateEq2.mockResolvedValue({ error: null });
  });

  it("updates message status for delivered event", async () => {
    const { POST } = await import("@/app/api/webhooks/telnyx/status/route");

    const body = {
      data: {
        event_type: "message.delivered",
        payload: { id: "msg-abc" },
      },
    };

    const request = new Request("http://localhost/api/webhooks/telnyx/status", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    });

    const response = await POST(request);
    const json = await response.json();
    expect(json.ok).toBe(true);
    expect(mockUpdate).toHaveBeenCalledWith({ status: "delivered" });
  });

  it("ignores non-delivery events", async () => {
    const { POST } = await import("@/app/api/webhooks/telnyx/status/route");

    const body = {
      data: {
        event_type: "message.received",
      },
    };

    const request = new Request("http://localhost/api/webhooks/telnyx/status", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    });

    const response = await POST(request);
    const json = await response.json();
    expect(json.ok).toBe(true);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
