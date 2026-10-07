import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { FakeDb } from "@/__tests__/fake-db";
import { handleRpc } from "../server";

function ctx(fdb = new FakeDb()) {
  return {
    db: fdb as unknown as SupabaseClient,
    user: { userId: "u1", email: "u1@example.com", via: "api-key" as const },
    siteUrl: "https://smshub.dev",
  };
}

describe("mcp server", () => {
  it("initializes and lists tools", async () => {
    const init = (await handleRpc(ctx(), { jsonrpc: "2.0", id: 1, method: "initialize", params: {} })) as {
      result: { serverInfo: { name: string } };
    };
    expect(init.result.serverInfo.name).toBe("smshub");
    expect(await handleRpc(ctx(), { jsonrpc: "2.0", method: "notifications/initialized" })).toBeNull();
    const list = (await handleRpc(ctx(), { jsonrpc: "2.0", id: 2, method: "tools/list" })) as {
      result: { tools: { name: string }[] };
    };
    expect(list.result.tools.map((t) => t.name)).toEqual(
      expect.arrayContaining(["rent_number", "order_status", "get_messages", "wait_for_code", "list_numbers"])
    );
  });

  it("answers unknown methods and tools with errors", async () => {
    expect(await handleRpc(ctx(), { jsonrpc: "2.0", id: 3, method: "nope" })).toMatchObject({ error: { code: -32601 } });
    expect(
      await handleRpc(ctx(), { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "nope" } })
    ).toMatchObject({ error: { code: -32602 } });
  });

  it("returns the next one-time code on a number", async () => {
    const fdb = new FakeDb();
    const now = Date.now();
    fdb.rows("phone_numbers").push({ id: "n1", user_id: "u1", number: "+14085550001", status: "active" });
    fdb.rows("conversations").push({ id: "c1", user_id: "u1", phone_number_id: "n1", contacts: { phone: "+18005550000" } });
    fdb.rows("messages").push({
      id: "m1",
      conversation_id: "c1",
      direction: "inbound",
      body: "Your verification code is 552901",
      created_at: new Date(now + 1000).toISOString(),
    });
    const res = (await handleRpc(ctx(fdb), {
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: { name: "wait_for_code", arguments: { number_id: "n1", since: new Date(now).toISOString(), timeout_seconds: 1 } },
    })) as { result: { structuredContent: { code: string } } };
    expect(res.result.structuredContent.code).toBe("552901");

    const other = (await handleRpc(ctx(fdb), {
      jsonrpc: "2.0",
      id: 6,
      method: "tools/call",
      params: { name: "get_messages", arguments: { number_id: "not-mine" } },
    })) as { result: { structuredContent: { error: string } } };
    expect(other.result.structuredContent.error).toBe("Number not found");
  });

  it("rent_number explains why it cannot open a checkout", async () => {
    const res = (await handleRpc(ctx(), {
      jsonrpc: "2.0",
      id: 7,
      method: "tools/call",
      params: { name: "rent_number", arguments: {} },
    })) as { result: { isError: boolean; content: { text: string }[] } };
    expect(res.result.isError).toBe(true);
    expect(res.result.content[0].text).toMatch(/not configured|open soon|private test/);
  });
});
