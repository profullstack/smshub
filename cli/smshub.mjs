#!/usr/bin/env node
// smshub CLI + TUI + stdio MCP bridge for https://smshub.dev. No dependencies.
//
//   smshub-cli login --key smshub_...      save an API key (Settings > API Keys)
//   smshub-cli numbers                      your numbers
//   smshub-cli rent [--area 415] [--months 1] [--chain USDC_POL]
//   smshub-cli order <order-id>
//   smshub-cli renew <number> [--months 1]
//   smshub-cli messages <number> [--since ISO] [--limit 20]
//   smshub-cli otp <number> [--wait 60]     print the next code, nothing else
//   smshub-cli conversations [--line <number>] [--limit 20]   the inbox, optionally one line
//   smshub-cli lines                        who shares each number (contacts book)
//   smshub-cli contacts <number> add --name Kim --cell +14155550123 [--digit 1] [--prefix K] [--forward-sms]
//   smshub-cli contacts <number> edit <contact-id> [--name ..] [--cell ..] [--digit 1|none] [--prefix K|none]
//   smshub-cli contacts <number> rm <contact-id>
//   smshub-cli contacts <number> share <other-number|none>   use another line's contacts and menu
//   smshub-cli voice <number> [--setup] [--force] [--record on|off]   where calls go; --setup plays the voice menu
//   smshub-cli recording <call-message-id> [--out call.mp3]   save a recorded call as MP3
//   smshub-cli tui                          live view of numbers and texts
//   smshub-cli mcp                          MCP over stdio, proxied to smshub.dev
//
// <number> is a number id or the number itself (+14155550123); --line also takes a line name ("Mom").
// Every command takes --json. SMSHUB_API_KEY and SMSHUB_URL override the config.

import { readFileSync, writeFileSync, mkdirSync, chmodSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";

const VERSION = "1.4.0";
const CONFIG_DIR = join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "smshub");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const [k, v] = a.slice(2).split("=", 2);
      if (v !== undefined) out[k] = v;
      else if (argv[i + 1] !== undefined && !argv[i + 1].startsWith("--")) out[k] = argv[++i];
      else out[k] = true;
    } else out._.push(a);
  }
  return out;
}

function loadConfig() {
  try {
    return JSON.parse(readFileSync(CONFIG_FILE, "utf8"));
  } catch {
    return {};
  }
}

function saveConfig(cfg) {
  mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2) + "\n", { mode: 0o600 });
  chmodSync(CONFIG_FILE, 0o600);
}

const cfg = loadConfig();
const BASE = (process.env.SMSHUB_URL || cfg.url || "https://smshub.dev").replace(/\/+$/, "");
const KEY = process.env.SMSHUB_API_KEY || cfg.apiKey || "";
// The API key travels in a header, so never over plain http except to this machine.
if (!/^https:\/\/|^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) {
  console.error(`Refusing to send the API key to ${BASE}: use an https:// URL`);
  process.exit(1);
}

class ApiError extends Error {}

async function api(path, { method = "GET", body, timeoutMs = 70_000 } = {}) {
  if (!KEY) throw new ApiError("No API key. Create one at https://smshub.dev/settings/api-keys, then: smshub-cli login --key <key>");
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "X-API-Key": KEY, "Content-Type": "application/json", "User-Agent": `smshub-cli/${VERSION}` },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { error: text.slice(0, 200) };
  }
  if (!res.ok) throw new ApiError(json.error || `HTTP ${res.status}`);
  return json;
}

async function resolveNumberId(ref) {
  if (!ref) throw new ApiError("Which number? Pass a number id or +E164 number (see: smshub-cli numbers)");
  if (!ref.startsWith("+")) return ref;
  const { numbers } = await api("/api/v1/numbers");
  const hit = numbers.find((n) => n.number === ref);
  if (!hit) throw new ApiError(`${ref} is not on your account`);
  return hit.id;
}

// A line is one of your numbers: its id, the +E164 number, or its friendly_name.
async function resolveLine(ref) {
  if (/^[0-9a-f-]{36}$/i.test(ref)) return ref;
  const { numbers } = await api("/api/v1/numbers");
  const want = ref.toLowerCase();
  const hit = numbers.find((n) => n.number === ref || (n.friendly_name || "").toLowerCase() === want);
  if (!hit) throw new ApiError(`${ref} is not one of your lines (see: smshub-cli numbers)`);
  return hit.id;
}

const contactLine = (c) =>
  [c.name, c.forward_to, c.keypad_digit != null ? `press ${c.keypad_digit}` : "", c.sms_prefix ? `"${c.sms_prefix}:"` : "", c.forward_sms ? "forwards texts" : "", c.id]
    .filter(Boolean)
    .join("  ");
const date = (iso) => (iso ? new Date(iso).toISOString().slice(0, 10) : "");
const print = (args, data, human) => (args.json ? console.log(JSON.stringify(data, null, 2)) : human(data));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const commands = {
  async login(args) {
    const key = args.key || args._[1];
    if (!/^smshub_[0-9a-f]{64}$/.test(key || "")) throw new ApiError("Usage: smshub-cli login --key smshub_<64 hex>");
    saveConfig({ ...cfg, apiKey: key, ...(args.url ? { url: args.url } : {}) });
    console.log(`Saved to ${CONFIG_FILE}`);
  },

  async numbers(args) {
    const d = await api("/api/v1/numbers");
    print(args, d, (d) => {
      if (!d.numbers.length) console.log("No numbers yet. Rent one: smshub-cli rent");
      for (const n of d.numbers) {
        const tail = n.managed ? `rented, paid until ${date(n.expires_at)}` : "your provider";
        console.log(`${n.number}  ${n.id}  ${n.friendly_name ? `"${n.friendly_name}"  ` : ""}${tail}`);
      }
      console.log(`\nPlan: ${d.plan.plan}. Rent: $${d.pricing.usd_per_month}/month.${d.ordering.open ? "" : " " + d.ordering.reason}`);
    });
  },

  async rent(args) {
    const { order } = await api("/api/v1/numbers/orders", {
      method: "POST",
      body: { area_code: args.area, months: Number(args.months || 1), chain: args.chain },
    });
    if (args.json && args["no-wait"]) return console.log(JSON.stringify(order, null, 2));
    if (!args.json) {
      console.log(`Order ${order.id}: $${Number(order.amount_usd).toFixed(2)} in ${order.chain}`);
      console.log(`Pay here: ${order.pay_url}`);
    }
    if (args["no-wait"]) return;
    if (!args.json) process.stdout.write("Waiting for the payment to confirm (Ctrl+C to stop; check later with: smshub-cli order " + order.id + ")");
    for (;;) {
      await sleep(10_000);
      const { order: o } = await api(`/api/v1/numbers/orders/${order.id}`);
      if (o.status === "active" || o.status === "failed" || o.status === "expired") {
        if (args.json) return console.log(JSON.stringify(o, null, 2));
        console.log(o.status === "active" ? `\nYour number: ${o.number}` : `\n${o.status}: ${o.error || ""}`);
        return;
      }
      if (!args.json) process.stdout.write(".");
    }
  },

  async order(args) {
    const { order } = await api(`/api/v1/numbers/orders/${args._[1]}`);
    print(args, order, (o) => console.log(`${o.id}  ${o.status}  ${o.number || ""}  ${o.pay_url || ""}${o.error ? "  " + o.error : ""}`));
  },

  async renew(args) {
    const id = await resolveNumberId(args._[1]);
    const { order } = await api(`/api/v1/numbers/${id}/renew`, {
      method: "POST",
      body: { months: Number(args.months || 1), chain: args.chain },
    });
    print(args, order, (o) => console.log(`Pay here: ${o.pay_url}`));
  },

  async lines(args) {
    const d = await api("/api/lines");
    print(args, d, (d) => {
      if (!d.lines.length) console.log("No numbers yet.");
      for (const l of d.lines) {
        console.log(`${l.number}  ${l.friendly_name || ""}  ${l.id}`);
        if (!l.contacts.length) console.log("  (no contacts: smshub-cli contacts " + l.number + " add --name .. --cell ..)");
        for (const c of l.contacts) console.log("  " + contactLine(c));
      }
    });
  },

  async contacts(args) {
    const id = await resolveLine(args._[1] || "");
    const sub = args._[2] || "list";
    const base = `/api/lines/${id}/contacts`;
    const fields = () => {
      const b = {};
      if (args.name !== undefined) b.name = String(args.name);
      if (args.cell !== undefined) b.forward_to = String(args.cell);
      if (args.digit !== undefined) b.keypad_digit = args.digit === "none" ? null : Number(args.digit);
      if (args.prefix !== undefined) b.sms_prefix = args.prefix === "none" ? null : String(args.prefix);
      if (args["forward-sms"] !== undefined) b.forward_sms = args["forward-sms"] !== "false";
      return b;
    };
    let d;
    if (sub === "list") d = await api(base);
    else if (sub === "add") d = await api(base, { method: "POST", body: fields() });
    else if (sub === "edit") d = await api(`${base}/${args._[3]}`, { method: "PATCH", body: fields() });
    else if (sub === "rm") d = await api(`${base}/${args._[3]}`, { method: "DELETE" });
    else if (sub === "share") {
      const other = args._[3];
      if (!other) throw new ApiError("Usage: smshub-cli contacts <number> share <other-number|none>");
      const from = other === "none" ? null : await resolveLine(other);
      d = await api(`/api/lines/${id}`, { method: "PATCH", body: { contacts_from: from } });
      if (!args.json) console.log(from ? `Now answers with ${other}'s contacts.` : "Has its own contacts again.");
    }
    else throw new ApiError("Usage: smshub-cli contacts <number> [list|add|edit <id>|rm <id>|share <other|none>]");
    print(args, d, (d) => {
      if (d.contacts) for (const c of d.contacts) console.log(contactLine(c));
      if (d.contact) console.log(contactLine(d.contact));
      if (d.voice) console.log(`Calls: ${d.voice.message}`);
      if (d.ok) console.log("Removed.");
    });
  },

  async voice(args) {
    const id = await resolveLine(args._[1] || "");
    if (args.record !== undefined) {
      const on = String(args.record) !== "off" && String(args.record) !== "false";
      await api(`/api/lines/${id}`, { method: "PATCH", body: { record_calls: on } });
      if (!args.json) console.log(`Call recording ${on ? "on" : "off"}.`);
    }
    const d = await api(`/api/lines/${id}/voice`, args.setup ? { method: "POST", body: { force: Boolean(args.force) } } : {});
    print(args, d, (d) => console.log(d.voice.message));
  },

  async recording(args) {
    const id = args._[1];
    if (!id) throw new ApiError("Usage: smshub-cli recording <call-message-id> [--out call.mp3]");
    if (!KEY) throw new ApiError("No API key. smshub-cli login --key <key>");
    const res = await fetch(`${BASE}/api/messages/${encodeURIComponent(id)}/recording?download=1`, {
      headers: { "X-API-Key": KEY, "User-Agent": `smshub-cli/${VERSION}` },
    });
    if (!res.ok) throw new ApiError((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
    const out = args.out || `call-${id}.mp3`;
    writeFileSync(out, Buffer.from(await res.arrayBuffer()));
    console.log(`Saved ${out}`);
  },

  async messages(args) {
    const id = await resolveNumberId(args._[1]);
    const q = new URLSearchParams({ limit: String(args.limit || 20) });
    if (args.since) q.set("since", args.since);
    const { messages } = await api(`/api/v1/numbers/${id}/messages?${q}`);
    print(args, messages, (ms) => {
      if (!ms.length) console.log("No texts yet.");
      for (const m of ms) console.log(`${m.received_at.slice(0, 19)}  ${m.from}  ${m.otp ? `[${m.otp}] ` : ""}${m.body}`);
    });
  },

  async otp(args) {
    const id = await resolveNumberId(args._[1]);
    const waitTotal = Number(args.wait ?? 60);
    let since = args.since || new Date(Date.now() - (args.recent ? Number(args.recent) * 1000 : 0)).toISOString();
    const deadline = Date.now() + waitTotal * 1000;
    for (;;) {
      const left = Math.max(0, Math.min(55, Math.ceil((deadline - Date.now()) / 1000)));
      const q = new URLSearchParams({ since, wait: String(left), limit: "20" });
      const { messages } = await api(`/api/v1/numbers/${id}/messages?${q}`);
      const hit = messages.find((m) => m.otp);
      if (hit) return args.json ? console.log(JSON.stringify(hit, null, 2)) : console.log(hit.otp);
      if (messages[0]) since = messages[0].received_at;
      if (Date.now() >= deadline) {
        console.error("No code arrived.");
        process.exit(2);
      }
    }
  },

  async tui() {
    if (!process.stdout.isTTY) throw new ApiError("tui needs a terminal");
    const out = process.stdout;
    let numbers = [];
    let sel = 0;
    let texts = [];
    let status = "loading...";
    const draw = () => {
      const w = out.columns || 80;
      const lines = [];
      lines.push(`\x1b[1msmshub\x1b[0m  ${BASE}   ↑/↓ number  r refresh  q quit`);
      lines.push("─".repeat(w));
      numbers.forEach((n, i) => {
        const mark = i === sel ? "\x1b[7m" : "";
        const tail = n.managed ? `rented until ${date(n.expires_at)}` : "own provider";
        lines.push(`${mark} ${n.number.padEnd(16)} ${tail}\x1b[0m`);
      });
      if (!numbers.length) lines.push(" No numbers. Rent one: smshub-cli rent");
      lines.push("─".repeat(w));
      for (const m of texts.slice(0, (out.rows || 24) - lines.length - 2)) {
        const code = m.otp ? `\x1b[32m${m.otp.padEnd(8)}\x1b[0m ` : "".padEnd(9);
        lines.push(`${m.received_at.slice(11, 19)} ${code}${(m.from || "").padEnd(14)} ${m.body}`.slice(0, w + 9));
      }
      if (!texts.length && numbers.length) lines.push(" No texts on this number yet.");
      lines.push("", `\x1b[2m${status}\x1b[0m`);
      out.write("\x1b[H\x1b[2J" + lines.join("\n"));
    };
    const refresh = async () => {
      try {
        numbers = (await api("/api/v1/numbers")).numbers;
        sel = Math.min(sel, Math.max(0, numbers.length - 1));
        texts = numbers[sel] ? (await api(`/api/v1/numbers/${numbers[sel].id}/messages?limit=50`)).messages : [];
        status = `updated ${new Date().toLocaleTimeString()}`;
      } catch (e) {
        status = `error: ${e.message}`;
      }
      draw();
    };
    out.write("\x1b[?1049h\x1b[?25l");
    const quit = () => {
      out.write("\x1b[?25h\x1b[?1049l");
      process.exit(0);
    };
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on("data", (b) => {
      const k = b.toString();
      if (k === "q" || k === "\u0003") quit();
      else if (k === "\u001b[A") (sel = Math.max(0, sel - 1)), refresh();
      else if (k === "\u001b[B") (sel = Math.min(numbers.length - 1, sel + 1)), refresh();
      else if (k === "r") refresh();
    });
    out.on("resize", draw);
    await refresh();
    setInterval(refresh, 3000);
    await new Promise(() => {});
  },

  async conversations(args) {
    const line = args.line && args.line !== true ? await resolveLine(String(args.line)) : null;
    const d = await api(`/api/v1/conversations${line ? `?phone_number_id=${encodeURIComponent(line)}` : ""}`);
    const limit = Number(args.limit) || 20;
    const rows = d.conversations.slice(0, limit);
    print(args, { conversations: rows }, () => {
      if (!rows.length) console.log(line ? "No conversations on that line." : "No conversations yet.");
      for (const c of rows) {
        const who = c.contacts?.name ? `${c.contacts.name} (${c.contacts.phone})` : c.contacts?.phone || "?";
        const via = c.phone_numbers?.friendly_name || c.phone_numbers?.number || "";
        const unread = c.unread_count ? `  ${c.unread_count} unread` : "";
        console.log(`${date(c.last_message_at)}  ${who}  via ${via}${unread}${c.archived ? "  [archived]" : ""}`);
      }
    });
  },

  // stdio MCP server: each JSON-RPC line goes to smshub.dev/api/mcp, replies come back as lines.
  async mcp() {
    const rl = createInterface({ input: process.stdin });
    for await (const line of rl) {
      if (!line.trim()) continue;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }) + "\n");
        continue;
      }
      try {
        const res = await fetch(`${BASE}/api/mcp`, {
          method: "POST",
          headers: { "X-API-Key": KEY, "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(msg),
        });
        if (res.status === 202) continue;
        process.stdout.write((await res.text()).trim() + "\n");
      } catch (e) {
        if (msg.id !== undefined) {
          process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: msg.id, error: { code: -32603, message: String(e.message || e) } }) + "\n");
        }
      }
    }
  },

  help() {
    const src = readFileSync(new URL(import.meta.url), "utf8").split("\n");
    console.log(src.slice(1, src.findIndex((l) => l.startsWith("import"))).map((l) => l.replace(/^\/\/ ?/, "")).join("\n").trim());
  },

  version() {
    console.log(VERSION);
  },
};

const args = parseArgs(process.argv.slice(2));
const name = args._[0] || "help";
const cmd = commands[name] || (args.version ? commands.version : null);
if (!cmd) {
  console.error(`Unknown command: ${name}\n`);
  commands.help();
  process.exit(1);
}
try {
  await cmd(args);
} catch (e) {
  console.error(e instanceof ApiError ? e.message : e);
  process.exit(1);
}
