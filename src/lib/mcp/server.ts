/**
 * smshub as an MCP server (streamable HTTP, JSON responses). An agent can rent a
 * number, hand the pay link to whoever pays, and wait for a verification code.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getOrder, listNumbers, listOrders, numberMessages, overview } from "@/lib/managed-numbers/api";
import { createOrder, OrderError } from "@/lib/managed-numbers/service";
import type { RequestUser } from "@/lib/request-user";

export const PROTOCOL_VERSION = "2025-06-18";
const MAX_WAIT_SECONDS = 55;

interface Tool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  run: (ctx: Ctx, args: Record<string, unknown>) => Promise<unknown>;
}

interface Ctx {
  db: SupabaseClient;
  user: RequestUser;
  siteUrl: string;
  signal?: AbortSignal;
}

const obj = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});

const TOOLS: Tool[] = [
  {
    name: "account_overview",
    description: "Plan, limits, price per rented number, accepted coins, numbers and recent orders.",
    inputSchema: obj({}),
    run: (c) => overview(c.db, c.user.userId, c.user.email),
  },
  {
    name: "list_numbers",
    description: "Phone numbers on this account (rented and bring-your-own), with expiry for rented ones.",
    inputSchema: obj({}),
    run: (c) => listNumbers(c.db, c.user.userId),
  },
  {
    name: "rent_number",
    description:
      "Start renting a US number that receives SMS. Returns an order with pay_url (a CoinPay crypto checkout). The number is provisioned once the payment confirms; poll order_status.",
    inputSchema: obj({
      area_code: { type: "string", description: "Preferred 3-digit US area code; nearest available if none." },
      months: { type: "integer", minimum: 1, maximum: 12, default: 1 },
      chain: { type: "string", description: "Coin to pay with, e.g. USDC_POL (default), USDC_SOL, BTC, ETH." },
    }),
    run: (c, a) =>
      createOrder({ db: c.db }, { userId: c.user.userId, email: c.user.email, kind: "new", areaCode: a.area_code, months: a.months, chain: a.chain, siteUrl: c.siteUrl }),
  },
  {
    name: "renew_number",
    description: "Extend a rented number. Returns an order with pay_url.",
    inputSchema: obj(
      { number_id: { type: "string" }, months: { type: "integer", minimum: 1, maximum: 12, default: 1 }, chain: { type: "string" } },
      ["number_id"]
    ),
    run: (c, a) =>
      createOrder({ db: c.db }, { userId: c.user.userId, email: c.user.email, kind: "renew", phoneNumberId: String(a.number_id), months: a.months, chain: a.chain, siteUrl: c.siteUrl }),
  },
  {
    name: "order_status",
    description: "Status of a rent/renew order: pending (unpaid), paid (provisioning), active (done), failed, expired.",
    inputSchema: obj({ order_id: { type: "string" } }, ["order_id"]),
    run: async (c, a) => (await getOrder(c.db, c.user.userId, String(a.order_id))) ?? { error: "Order not found" },
  },
  {
    name: "list_orders",
    description: "Recent rent/renew orders.",
    inputSchema: obj({}),
    run: (c) => listOrders(c.db, c.user.userId),
  },
  {
    name: "get_messages",
    description: "Texts received on a number, newest first, each with any one-time code extracted as `otp`.",
    inputSchema: obj(
      {
        number_id: { type: "string" },
        since: { type: "string", description: "ISO timestamp; only newer texts." },
        limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
      },
      ["number_id"]
    ),
    run: async (c, a) =>
      (await numberMessages(c.db, c.user.userId, String(a.number_id), { since: a.since as string | undefined, limit: Number(a.limit) || 20 })) ?? {
        error: "Number not found",
      },
  },
  {
    name: "wait_for_code",
    description:
      "Wait (up to 55s) for the next text on a number that contains a one-time code and return it. Call again to keep waiting.",
    inputSchema: obj(
      {
        number_id: { type: "string" },
        since: { type: "string", description: "ISO timestamp; defaults to now, so only new texts count." },
        timeout_seconds: { type: "integer", minimum: 1, maximum: MAX_WAIT_SECONDS, default: 45 },
      },
      ["number_id"]
    ),
    run: async (c, a) => {
      const since = (a.since as string) || new Date().toISOString();
      const deadline = Date.now() + Math.min(MAX_WAIT_SECONDS, Math.max(1, Number(a.timeout_seconds) || 45)) * 1000;
      for (;;) {
        const msgs = await numberMessages(c.db, c.user.userId, String(a.number_id), { since, limit: 20 });
        if (msgs === null) return { error: "Number not found" };
        const hit = msgs.find((m) => m.otp);
        if (hit) return { code: hit.otp, message: hit };
        if (Date.now() >= deadline || c.signal?.aborted) return { code: null, timed_out: true, since };
        await new Promise((r) => setTimeout(r, 2000));
      }
    },
  },
];

interface RpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

const ok = (id: RpcRequest["id"], result: unknown) => ({ jsonrpc: "2.0", id: id ?? null, result });
const err = (id: RpcRequest["id"], code: number, message: string) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

/** One JSON-RPC message in, one response out (null for notifications). */
export async function handleRpc(ctx: Ctx, msg: RpcRequest): Promise<unknown | null> {
  const isNotification = msg.id === undefined;
  switch (msg.method) {
    case "initialize":
      return ok(msg.id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "smshub", version: "1.0.0" },
        instructions:
          "Rent a US phone number that receives SMS, then wait for verification codes on it. rent_number returns a pay_url that a human or a paying agent must complete; poll order_status until active, then use wait_for_code.",
      });
    case "notifications/initialized":
    case "notifications/cancelled":
      return null;
    case "ping":
      return ok(msg.id, {});
    case "tools/list":
      return ok(msg.id, { tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
    case "tools/call": {
      const name = String(msg.params?.name ?? "");
      const tool = TOOLS.find((t) => t.name === name);
      if (!tool) return err(msg.id, -32602, `Unknown tool: ${name}`);
      try {
        const result = await tool.run(ctx, (msg.params?.arguments as Record<string, unknown>) ?? {});
        return ok(msg.id, {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          structuredContent: Array.isArray(result) ? { items: result } : result,
        });
      } catch (e) {
        const message = e instanceof OrderError ? e.message : "Tool failed";
        if (!(e instanceof OrderError)) console.error(`mcp tool ${name} error:`, e);
        return ok(msg.id, { content: [{ type: "text", text: message }], isError: true });
      }
    }
    default:
      return isNotification ? null : err(msg.id, -32601, `Method not found: ${msg.method}`);
  }
}
