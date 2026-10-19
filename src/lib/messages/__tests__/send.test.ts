import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { FakeDb } from "@/__tests__/fake-db";
import { resetRateLimitStore } from "@/lib/rate-limit";

const sendSMS = vi.fn();
vi.mock("@/lib/providers", async (orig) => ({ ...(await orig<typeof import("@/lib/providers")>()), sendSMS: (p: unknown) => sendSMS(p) }));

const { sendMessage, SendError } = await import("../send");
const { handleRpc } = await import("@/lib/mcp/server");

const OWN = "11111111-1111-4111-8111-111111111111";
const RENTED = "22222222-2222-4222-8222-222222222222";

function db() {
  const fdb = new FakeDb();
  fdb.rows("phone_numbers").push(
    { id: OWN, user_id: "u1", number: "+14085550001", status: "active", managed: false, providers: { type: "telnyx", api_key: "k", api_secret: null } },
    { id: RENTED, user_id: "u1", number: "+14085550002", status: "active", managed: true, providers: { type: "telnyx", api_key: "__managed__", api_secret: null } }
  );
  return fdb;
}

describe("sendMessage", () => {
  beforeEach(() => {
    sendSMS.mockReset().mockResolvedValue({ success: true, messageId: "pm1" });
    resetRateLimitStore();
  });

  it("sends from the only number that can send when from is omitted, and files it in the inbox", async () => {
    const fdb = db();
    const r = await sendMessage(fdb as unknown as SupabaseClient, "u1", { to: "(415) 555-1234", message: "hi" });
    expect(r.from).toBe("+14085550001");
    expect(r.to).toBe("+14155551234");
    expect(sendSMS).toHaveBeenCalledWith(expect.objectContaining({ to: "+14155551234", from: "+14085550001", body: "hi" }));
    expect(fdb.rows("messages")).toMatchObject([{ direction: "outbound", status: "sent", provider_message_id: "pm1" }]);
    expect(fdb.rows("conversations")).toHaveLength(1);
    await sendMessage(fdb as unknown as SupabaseClient, "u1", { to: "+14155551234", message: "again", from: OWN });
    expect(fdb.rows("conversations")).toHaveLength(1);
  });

  it("rejects numbers that are not yours and bad input", async () => {
    const fdb = db() as unknown as SupabaseClient;
    await expect(sendMessage(fdb, "u2", { to: "+14155551234", message: "x", from: OWN })).rejects.toMatchObject({ status: 404 });
    await expect(sendMessage(fdb, "u1", { to: "+14155551234" })).rejects.toBeInstanceOf(SendError);
    await expect(sendMessage(fdb, "u1", { to: "+1415555", message: "x" })).rejects.toMatchObject({ status: 400 });
    expect(sendSMS).not.toHaveBeenCalled();
  });

  it("records a failed send and reports it", async () => {
    sendSMS.mockResolvedValue({ success: false, error: "carrier said no" });
    const fdb = db();
    await expect(sendMessage(fdb as unknown as SupabaseClient, "u1", { to: "+14155551234", message: "x" })).rejects.toMatchObject({
      status: 502,
      message: "carrier said no",
    });
    expect(fdb.rows("messages")).toMatchObject([{ status: "failed", error_detail: "carrier said no" }]);
  });

  it("rate limits at 10 a minute", async () => {
    const fdb = db() as unknown as SupabaseClient;
    for (let i = 0; i < 10; i++) await sendMessage(fdb, "u1", { to: "+14155551234", message: String(i) });
    await expect(sendMessage(fdb, "u1", { to: "+14155551234", message: "11" })).rejects.toMatchObject({ status: 429 });
  });

  it("is exposed over MCP as send_message and get_conversation", async () => {
    const fdb = db();
    const ctx = { db: fdb as unknown as SupabaseClient, user: { userId: "u1", email: null, via: "api-key" as const }, siteUrl: "https://smshub.dev" };
    const call = async (name: string, args: Record<string, unknown>) =>
      (await handleRpc(ctx, { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } })) as {
        result: { isError?: boolean; content: { text: string }[]; structuredContent: Record<string, unknown> };
      };
    const sent = await call("send_message", { to: "+14155551234", message: "hello" });
    expect(sent.result.isError).toBeUndefined();
    const convo = fdb.rows("conversations")[0].id as string;
    const thread = await call("get_conversation", { conversation_id: convo });
    expect(thread.result.structuredContent).toMatchObject({ items: [{ body: "hello", direction: "outbound" }] });
    const bad = await call("send_message", { to: "+14155551234", message: "x", from: "+19999999999" });
    expect(bad.result).toMatchObject({ isError: true, content: [{ text: "Phone number not found or not owned by you" }] });
  });
});
