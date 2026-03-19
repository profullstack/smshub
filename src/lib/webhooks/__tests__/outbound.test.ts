import { describe, it, expect, vi, afterEach } from "vitest";
import {
  signPayload,
  generateWebhookSecret,
  fireWebhooks,
  type UserWebhook,
} from "../outbound";

describe("signPayload", () => {
  it("generates consistent HMAC-SHA256 signatures", () => {
    const payload = '{"event":"message.sent"}';
    const secret = "test-secret";
    const sig1 = signPayload(payload, secret);
    const sig2 = signPayload(payload, secret);
    expect(sig1).toBe(sig2);
    expect(sig1).toMatch(/^[a-f0-9]{64}$/);
  });

  it("generates different signatures for different secrets", () => {
    const payload = '{"event":"message.sent"}';
    expect(signPayload(payload, "secret1")).not.toBe(
      signPayload(payload, "secret2")
    );
  });
});

describe("generateWebhookSecret", () => {
  it("returns a 40-char hex string", () => {
    const secret = generateWebhookSecret();
    expect(secret).toMatch(/^[a-f0-9]{40}$/);
  });

  it("generates unique secrets", () => {
    const s1 = generateWebhookSecret();
    const s2 = generateWebhookSecret();
    expect(s1).not.toBe(s2);
  });
});

describe("fireWebhooks", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends POST to matching webhooks with signature", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(new Response());

    const webhooks: UserWebhook[] = [
      {
        id: "wh-1",
        user_id: "user-1",
        url: "https://example.com/hook",
        events: ["message.sent"],
        secret: "test-secret",
        active: true,
      },
    ];

    await fireWebhooks(webhooks, "message.sent", { message_id: "msg-1" });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const call = fetchSpy.mock.calls[0];
    expect(call[0]).toBe("https://example.com/hook");
    expect((call[1] as RequestInit).method).toBe("POST");
    expect((call[1] as RequestInit).headers).toHaveProperty("X-Webhook-Signature");
    expect((call[1] as RequestInit).headers).toHaveProperty("X-Webhook-Event", "message.sent");
  });

  it("skips inactive webhooks", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(new Response());

    const webhooks: UserWebhook[] = [
      {
        id: "wh-1",
        user_id: "user-1",
        url: "https://example.com/hook",
        events: ["message.sent"],
        secret: "test-secret",
        active: false,
      },
    ];

    await fireWebhooks(webhooks, "message.sent", {});
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("skips webhooks not subscribed to the event", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(new Response());

    const webhooks: UserWebhook[] = [
      {
        id: "wh-1",
        user_id: "user-1",
        url: "https://example.com/hook",
        events: ["message.received"],
        secret: "test-secret",
        active: true,
      },
    ];

    await fireWebhooks(webhooks, "message.sent", {});
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("does not throw on fetch failure", async () => {
    vi.spyOn(global, "fetch").mockRejectedValue(new Error("Network error"));

    const webhooks: UserWebhook[] = [
      {
        id: "wh-1",
        user_id: "user-1",
        url: "https://example.com/hook",
        events: ["message.sent"],
        secret: "test-secret",
        active: true,
      },
    ];

    // Should not throw
    await fireWebhooks(webhooks, "message.sent", {});
  });
});
