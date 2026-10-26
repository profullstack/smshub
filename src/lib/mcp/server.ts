/**
 * smshub as an MCP server (streamable HTTP, JSON responses). An agent can rent a
 * number, hand the pay link to whoever pays, and wait for a verification code.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getOrder, listNumbers, listOrders, numberMessages, overview } from "@/lib/managed-numbers/api";
import { createOrder, OrderError } from "@/lib/managed-numbers/service";
import { conversationMessages, isUuid, listConversations } from "@/lib/conversations";
import { SendError, sendMessage } from "@/lib/messages/send";
import type { RequestUser } from "@/lib/request-user";
import { LINE_TOOLS, LineToolError } from "./line-tools";
import { AlertError, listAlerts, sendAlert } from "@/lib/alerts/service";
import { createInvite, creditSummary, invitesSummary, redeemCode } from "@/lib/rewards";

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
    name: "list_conversations",
    description:
      "Conversations in the inbox, newest first, each with its contact, the line (number + friendly_name) it is on, and unread_count. Pass phone_number_id to see one line only.",
    inputSchema: obj({
      phone_number_id: { type: "string", description: "A number id from list_numbers; only conversations on that line." },
      archived: { type: "boolean", description: "true for archived only, false for the inbox; both when omitted." },
      limit: { type: "integer", minimum: 1, maximum: 200, default: 50 },
    }),
    run: async (c, a) => {
      const phoneNumberId = a.phone_number_id ? String(a.phone_number_id) : null;
      if (phoneNumberId && !isUuid(phoneNumberId)) return { error: "phone_number_id must be a number id from list_numbers" };
      const limit = Math.min(200, Math.max(1, Number(a.limit) || 50));
      const archived = typeof a.archived === "boolean" ? a.archived : undefined;
      return { conversations: await listConversations(c.db, c.user.userId, { phoneNumberId, archived, limit }) };
    },
  },
  {
    name: "get_conversation",
    description: "Messages in one conversation (from list_conversations), oldest first, both directions.",
    inputSchema: obj(
      { conversation_id: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 200, default: 50 } },
      ["conversation_id"]
    ),
    run: async (c, a) =>
      (await conversationMessages(c.db, c.user.userId, String(a.conversation_id), Number(a.limit) || 50)) ?? { error: "Conversation not found" },
  },
  {
    name: "send_message",
    description:
      "Send one SMS from one of your own (Twilio/Telnyx) numbers. Rented numbers receive only. 10 sends per minute.",
    inputSchema: obj(
      {
        to: { type: "string", description: "Recipient, E.164, e.g. +14155551234." },
        message: { type: "string", maxLength: 1600 },
        from: { type: "string", description: "Your number (E.164) or its id from list_numbers; optional if only one of your numbers can send." },
        media_url: { type: "string", description: "Optional public image URL to send as MMS." },
      },
      ["to", "message"]
    ),
    run: (c, a) => sendMessage(c.db, c.user.userId, a),
  },
  {
    name: "rent_number",
    description:
      "Start renting a US number that receives SMS. Returns an order with pay_url (a CoinPay crypto checkout). The number is provisioned once the payment confirms; poll order_status.",
    inputSchema: obj({
      area_code: { type: "string", description: "Preferred 3-digit US area code; nearest available if none." },
      months: { type: "integer", minimum: 1, maximum: 12, default: 1 },
      chain: { type: "string", description: "How to pay: CREDIT (store credit, set up at once, no pay_url), PAYPAL, or a coin such as USDC_POL (default), USDC_SOL, USDC_BASE, USDT_POL, BTC, ETH, SOL, DOGE, XRP, ADA, BNB, BCH. GET /api/v1/numbers lists what is live." },
    }),
    run: (c, a) =>
      createOrder({ db: c.db }, { userId: c.user.userId, email: c.user.email, kind: "new", areaCode: a.area_code, months: a.months, chain: a.chain, siteUrl: c.siteUrl }),
  },
  {
    name: "renew_number",
    description: "Extend a rented number. Returns an order with pay_url, or pass chain CREDIT to pay from store credit at once.",
    inputSchema: obj(
      { number_id: { type: "string" }, months: { type: "integer", minimum: 1, maximum: 12, default: 1 }, chain: { type: "string" } },
      ["number_id"]
    ),
    run: (c, a) =>
      createOrder({ db: c.db }, { userId: c.user.userId, email: c.user.email, kind: "renew", phoneNumberId: String(a.number_id), months: a.months, chain: a.chain, siteUrl: c.siteUrl }),
  },
  {
    name: "redeem_code",
    description: "Redeem a credit code (CR-XXXX-XXXX-XXXX-XXXX) for store credit in USD. Store credit pays for rent_number/renew_number with chain CREDIT.",
    inputSchema: obj({ code: { type: "string" } }, ["code"]),
    run: (c, a) => redeemCode(c.user.userId, a.code),
  },
  {
    name: "credit_balance",
    description: "Store credit balance in USD, with recent grants (codes, invites) and spends (orders).",
    inputSchema: obj({}),
    run: (c) => creditSummary(c.user.userId),
  },
  {
    name: "list_invites",
    description: "Invite quota (3 per account), invites made so far, and your ?ref= referral link. An accepted invite gives you and the new account $2.50 of store credit each.",
    inputSchema: obj({}),
    run: (c) => invitesSummary(c.user.userId, c.siteUrl),
  },
  {
    name: "create_invite",
    description: "Create one invite link (single use, 30 days). The code is returned only once.",
    inputSchema: obj({ note: { type: "string", maxLength: 80, description: "Who it is for; only you see it." } }),
    run: (c, a) => createInvite(c.user.userId, c.siteUrl, a.note),
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
  {
    name: "send_alert",
    description:
      "Alert a human now: texts your alert phone (Settings > Alerts) when one of your numbers can send SMS, otherwise phones it and reads the message aloud twice. severity critical always calls. The same message to the same phone within 10 minutes is sent once.",
    inputSchema: obj(
      {
        message: { type: "string", maxLength: 600, description: "What happened, in one or two plain sentences (it may be read aloud)." },
        severity: { type: "string", enum: ["info", "warning", "critical"], default: "warning" },
        to: { type: "string", description: "Optional E.164 phone; must be your alert phone or someone in a line contacts book." },
      },
      ["message"]
    ),
    run: (c, a) => sendAlert({ db: c.db }, c.user.userId, a),
  },
  {
    name: "list_alerts",
    description: "Recent alerts, newest first, with how each went out (sms, call) and any error.",
    inputSchema: obj({ limit: { type: "integer", minimum: 1, maximum: 100, default: 20 } }),
    run: async (c, a) => ({ alerts: await listAlerts(c.db, c.user.userId, Number(a.limit) || 20) }),
  },
];

const ALL_TOOLS: Tool[] = [...TOOLS, ...LINE_TOOLS];

/** Names and descriptions, for the docs. */
export const MCP_TOOLS = ALL_TOOLS.map(({ name, description }) => ({ name, description }));

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
          "Rent a US phone number that receives SMS, then wait for verification codes on it. rent_number returns a pay_url that a human or a paying agent must complete; poll order_status until active, then use wait_for_code. With your own Twilio/Telnyx number connected, send_message texts anyone and list_conversations/get_conversation read the inbox.",
      });
    case "notifications/initialized":
    case "notifications/cancelled":
      return null;
    case "ping":
      return ok(msg.id, {});
    case "tools/list":
      return ok(msg.id, { tools: ALL_TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
    case "tools/call": {
      const name = String(msg.params?.name ?? "");
      const tool = ALL_TOOLS.find((t) => t.name === name);
      if (!tool) return err(msg.id, -32602, `Unknown tool: ${name}`);
      try {
        const result = await tool.run(ctx, (msg.params?.arguments as Record<string, unknown>) ?? {});
        return ok(msg.id, {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          structuredContent: Array.isArray(result) ? { items: result } : result,
        });
      } catch (e) {
        const known = e instanceof OrderError || e instanceof LineToolError || e instanceof AlertError || e instanceof SendError;
        const message = known ? (e as Error).message : "Tool failed";
        if (!known) console.error("mcp tool error:", { tool: name.replace(/[^\w-]/g, "").slice(0, 64) }, e);
        return ok(msg.id, { content: [{ type: "text", text: message }], isError: true });
      }
    }
    default:
      return isNotification ? null : err(msg.id, -32601, `Method not found: ${msg.method}`);
  }
}
