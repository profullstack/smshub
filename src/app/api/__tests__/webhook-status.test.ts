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

function telnyxEvent(eventType: string, recipientStatus: string, errors: unknown[] = []) {
  return {
    data: {
      event_type: eventType,
      id: "evt-1",
      payload: {
        id: "msg-abc",
        to: [{ phone_number: "+14085550100", status: recipientStatus }],
        errors,
      },
    },
  };
}

function post(path: string, body: unknown) {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/webhooks/telnyx/status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.TELNYX_PUBLIC_KEY;
    mockUpdate.mockReturnValue({ eq: mockUpdateEq1 });
    mockUpdateEq1.mockReturnValue({ eq: mockUpdateEq2 });
    mockUpdateEq2.mockResolvedValue({ error: null });
  });

  it("records delivered from message.finalized", async () => {
    const { POST } = await import("@/app/api/webhooks/telnyx/status/route");
    const response = await POST(post("/api/webhooks/telnyx/status", telnyxEvent("message.finalized", "delivered")));
    expect((await response.json()).ok).toBe(true);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: "delivered", error_code: null, error_detail: null })
    );
    expect(mockUpdateEq1).toHaveBeenCalledWith("provider_message_id", "msg-abc");
  });

  it("records delivery_failed from message.finalized with the carrier error", async () => {
    const { POST } = await import("@/app/api/webhooks/telnyx/status/route");
    const body = telnyxEvent("message.finalized", "delivery_failed", [
      {
        code: "40010",
        title: "Not 10DLC registered",
        detail: "The sending number is not 10DLC-registered but is required to be by the carrier.",
      },
    ]);
    await POST(post("/api/webhooks/telnyx/status", body));
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        error_code: "40010",
        error_detail:
          "Not 10DLC registered: The sending number is not 10DLC-registered but is required to be by the carrier.",
      })
    );
  });

  it("message.sent never overwrites a final status", async () => {
    const mockIn = vi.fn().mockResolvedValue({ error: null });
    mockUpdateEq2.mockReturnValue({ in: mockIn });
    const { POST } = await import("@/app/api/webhooks/telnyx/status/route");
    await POST(post("/api/webhooks/telnyx/status", telnyxEvent("message.sent", "sent")));
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: "sent" }));
    expect(mockIn).toHaveBeenCalledWith("status", ["queued", "sent"]);
  });

  it("ignores non-delivery events", async () => {
    const { POST } = await import("@/app/api/webhooks/telnyx/status/route");
    const response = await POST(post("/api/webhooks/telnyx/status", { data: { event_type: "message.received" } }));
    expect((await response.json()).ok).toBe(true);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("rejects an unsigned request when TELNYX_PUBLIC_KEY is set", async () => {
    process.env.TELNYX_PUBLIC_KEY = Buffer.alloc(32, 1).toString("base64");
    const { POST } = await import("@/app/api/webhooks/telnyx/status/route");
    const response = await POST(post("/api/webhooks/telnyx/status", telnyxEvent("message.finalized", "delivered")));
    expect(response.status).toBe(403);
    expect(mockUpdate).not.toHaveBeenCalled();
    delete process.env.TELNYX_PUBLIC_KEY;
  });
});

describe("POST /api/webhooks/telnyx (profile webhook)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.TELNYX_PUBLIC_KEY;
    mockUpdate.mockReturnValue({ eq: mockUpdateEq1 });
    mockUpdateEq1.mockReturnValue({ eq: mockUpdateEq2 });
    mockUpdateEq2.mockResolvedValue({ error: null });
  });

  it("records delivery outcomes sent to the main Telnyx webhook", async () => {
    const { POST } = await import("@/app/api/webhooks/telnyx/route");
    const body = telnyxEvent("message.finalized", "delivery_failed", [{ code: "40010", title: "Not 10DLC registered" }]);
    const response = await POST(post("/api/webhooks/telnyx", body));
    expect((await response.json()).ok).toBe(true);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed", error_code: "40010", error_detail: "Not 10DLC registered" })
    );
  });
});
