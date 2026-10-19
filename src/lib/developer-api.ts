/**
 * The public API in one place: /docs/api, /llms.txt and /openapi.json are all
 * generated from this list, so they cannot drift apart.
 */

export interface Param {
  name: string;
  in: "path" | "query" | "body";
  type: "string" | "integer" | "boolean";
  required?: boolean;
  description: string;
}

export interface Endpoint {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  summary: string;
  params?: Param[];
  cli?: string;
  mcp?: string;
}

const id = (description: string): Param => ({ name: "id", in: "path", type: "string", required: true, description });

export const ENDPOINTS: Endpoint[] = [
  { method: "GET", path: "/api/v1/numbers", summary: "Your numbers (rented and your own), plan and rental price.", cli: "numbers", mcp: "list_numbers" },
  {
    method: "POST",
    path: "/api/v1/numbers/orders",
    summary: "Rent a US number that receives SMS. Returns an order with a CoinPay pay_url.",
    params: [
      { name: "area_code", in: "body", type: "string", description: "Preferred 3-digit area code." },
      { name: "months", in: "body", type: "integer", description: "1 to 12, default 1." },
      { name: "chain", in: "body", type: "string", description: "Coin to pay with: USDC_POL (default), USDC_SOL, BTC, ETH..." },
    ],
    cli: "rent",
    mcp: "rent_number",
  },
  { method: "GET", path: "/api/v1/numbers/orders", summary: "Recent rent and renew orders.", mcp: "list_orders" },
  {
    method: "GET",
    path: "/api/v1/numbers/orders/{id}",
    summary: "One order: pending, paid, active, failed or expired.",
    params: [id("Order id.")],
    cli: "order",
    mcp: "order_status",
  },
  {
    method: "POST",
    path: "/api/v1/numbers/{id}/renew",
    summary: "Extend a rented number. Returns an order with a pay_url.",
    params: [
      id("Number id."),
      { name: "months", in: "body", type: "integer", description: "1 to 12, default 1." },
      { name: "chain", in: "body", type: "string", description: "Coin to pay with." },
    ],
    cli: "renew",
    mcp: "renew_number",
  },
  {
    method: "GET",
    path: "/api/v1/numbers/{id}/messages",
    summary: "Texts received on a number, newest first, with any one-time code as otp.",
    params: [
      id("Number id."),
      { name: "since", in: "query", type: "string", description: "ISO timestamp; only newer texts." },
      { name: "limit", in: "query", type: "integer", description: "Default 20, at most 100." },
      { name: "wait", in: "query", type: "integer", description: "Hold the request up to 55 s until a text arrives." },
    ],
    cli: "messages / otp",
    mcp: "get_messages / wait_for_code",
  },
  {
    method: "POST",
    path: "/api/v1/messages/send",
    summary: "Send one SMS from your own Twilio or Telnyx number. Rented numbers receive only. 10 per minute.",
    params: [
      { name: "to", in: "body", type: "string", required: true, description: "Recipient, E.164 (+14155551234)." },
      { name: "message", in: "body", type: "string", required: true, description: "Up to 1600 characters." },
      { name: "from", in: "body", type: "string", description: "Your number (E.164) or its id; optional when only one of your numbers can send." },
      { name: "media_url", in: "body", type: "string", description: "Public image URL to send as MMS." },
    ],
    cli: "send",
    mcp: "send_message",
  },
  {
    method: "GET",
    path: "/api/v1/conversations",
    summary: "The inbox, newest first, with contact, line and unread count.",
    params: [{ name: "phone_number_id", in: "query", type: "string", description: "Only conversations on this line." }],
    cli: "conversations",
    mcp: "list_conversations",
  },
  {
    method: "GET",
    path: "/api/v1/messages",
    summary: "Every message in one conversation, oldest first.",
    params: [{ name: "conversation_id", in: "query", type: "string", required: true, description: "From /api/v1/conversations." }],
    cli: "thread",
    mcp: "get_conversation",
  },
  {
    method: "POST",
    path: "/api/v1/alerts",
    summary: "Text or call your alert phone (Settings > Alerts). Same message within 10 minutes is sent once.",
    params: [
      { name: "message", in: "body", type: "string", required: true, description: "Up to 600 characters; it may be read aloud." },
      { name: "severity", in: "body", type: "string", description: "info, warning (default) or critical (always calls)." },
      { name: "to", in: "body", type: "string", description: "Your alert phone or someone in a line contacts book." },
    ],
    cli: "alert",
    mcp: "send_alert",
  },
  {
    method: "GET",
    path: "/api/v1/alerts",
    summary: "Recent alerts and how each went out.",
    params: [{ name: "limit", in: "query", type: "integer", description: "Default 20." }],
    cli: "alerts",
    mcp: "list_alerts",
  },
  { method: "GET", path: "/api/lines", summary: "Your lines and who shares each one (contacts book).", cli: "lines", mcp: "list_lines" },
  {
    method: "POST",
    path: "/api/lines/{id}/contacts",
    summary: "Add someone to a line's contacts book.",
    params: [
      id("Number id."),
      { name: "name", in: "body", type: "string", required: true, description: "Who this is." },
      { name: "forward_to", in: "body", type: "string", required: true, description: "Their cell, E.164." },
      { name: "keypad_digit", in: "body", type: "integer", description: "Voice-menu digit 0-9." },
      { name: "sms_prefix", in: "body", type: "string", description: "Prefix that routes a text to them, e.g. K." },
      { name: "forward_sms", in: "body", type: "boolean", description: "Forward texts to their cell." },
    ],
    cli: "contacts <number> add",
    mcp: "add_line_contact",
  },
];

export const MCP_URL = "/api/mcp";
export const NPM_PACKAGE = "@profullstack/smshub";

const schemaOf = (p: Param) => ({ type: p.type, description: p.description });

/** OpenAPI 3.1 for the endpoints above. */
export function openApi(siteUrl: string, name: string) {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const e of ENDPOINTS) {
    const params = e.params ?? [];
    const body = params.filter((p) => p.in === "body");
    const op: Record<string, unknown> = {
      summary: e.summary,
      operationId: `${e.method.toLowerCase()}${e.path.replace(/\{(\w+)\}/g, "By_$1").replace(/[^a-zA-Z0-9]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ""))}`,
      parameters: params
        .filter((p) => p.in !== "body")
        .map((p) => ({ name: p.name, in: p.in, required: p.in === "path" || !!p.required, schema: schemaOf(p) })),
      responses: { "200": { description: "OK" }, "401": { description: "Missing or invalid API key" }, "429": { description: "Rate limited" } },
    };
    if (body.length) {
      op.requestBody = {
        required: body.some((p) => p.required),
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: Object.fromEntries(body.map((p) => [p.name, schemaOf(p)])),
              required: body.filter((p) => p.required).map((p) => p.name),
            },
          },
        },
      };
    }
    (paths[e.path] ??= {})[e.method.toLowerCase()] = op;
  }
  return {
    openapi: "3.1.0",
    info: { title: `${name} API`, version: "1", description: `Rent numbers, receive and send SMS, and alert humans. Docs: ${siteUrl}/docs/api` },
    servers: [{ url: siteUrl }],
    security: [{ apiKey: [] }, { bearer: [] }],
    components: {
      securitySchemes: {
        apiKey: { type: "apiKey", in: "header", name: "X-API-Key" },
        bearer: { type: "http", scheme: "bearer", description: "Authorization: Bearer smshub_..." },
      },
    },
    paths,
  };
}

/** llms.txt: what an agent needs to start, in plain text. */
export function llmsTxt(siteUrl: string, name: string) {
  const lines = [
    `# ${name}`,
    "",
    `> Rent a US phone number that receives SMS and one-time codes, send texts from your own Twilio or Telnyx number, and have scripts and agents text or call a human. Everything works by REST API, CLI and MCP.`,
    "",
    "## Start",
    "",
    `- API key: create one at ${siteUrl}/settings/api-keys and send it as \`X-API-Key: smshub_...\` or \`Authorization: Bearer smshub_...\`.`,
    `- MCP (streamable HTTP): ${siteUrl}${MCP_URL} with the same header. Stdio: \`npx -y ${NPM_PACKAGE} mcp\` with SMSHUB_API_KEY set.`,
    `- CLI: \`npx ${NPM_PACKAGE} help\` (bin: smshub-cli).`,
    `- OpenAPI: ${siteUrl}/openapi.json`,
    `- Docs: ${siteUrl}/docs/api`,
    "",
    "## Endpoints",
    "",
    ...ENDPOINTS.map((e) => `- ${e.method} ${e.path}: ${e.summary}${e.mcp ? ` (MCP: ${e.mcp})` : ""}`),
    "",
  ];
  return lines.join("\n");
}
