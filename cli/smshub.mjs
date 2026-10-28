#!/usr/bin/env node
// smshub CLI + TUI + stdio MCP bridge for https://smshub.dev. No dependencies.
//
//   smshub-cli login --key smshub_...      save an API key (Settings > API Keys)
//   smshub-cli numbers                      your numbers
//   smshub-cli rent [--area 415] [--months 1] [--chain USDC_POL | --credit]   --credit pays from store credit
//   smshub-cli order <order-id>
//   smshub-cli renew <number> [--months 1] [--credit]
//   smshub-cli redeem <code>                redeem a credit code for store credit
//   smshub-cli credits                      store credit balance and history
//   smshub-cli invites [new [--note "for Kim"]]   your invites (3), make one, your ?ref= link
//   smshub-cli messages <number> [--since ISO] [--limit 20]
//   smshub-cli otp <number> [--wait 60]     print the next code, nothing else
//   smshub-cli send <to> "<message>" [--from <number>] [--media <url>]   text someone from your own number
//   smshub-cli groups                        your contact groups
//   smshub-cli group create "<name>" [--from <number>] [--relay] [--member +1415...[=Kim]]...   a group (members repeatable)
//   smshub-cli group <id>                    one group and its members (id or external_ref)
//   smshub-cli group add <id> +1415...[=Kim] [...]   add members
//   smshub-cli group remove <id> <phone>     remove a member
//   smshub-cli group send <id> "<message>" [--from <number>]   text every member (STOPped ones skipped)
//   smshub-cli group relay <id> on|off       members' replies go to the whole group (SMS group chat)
//   smshub-cli group rm <id>                 delete a group
//   smshub-cli webhooks                      your webhook endpoints and the event types
//   smshub-cli webhook add <https-url> [--event message.received]... [--description ..]   prints the signing secret once
//   smshub-cli webhook <id>                  one endpoint
//   smshub-cli webhook test|secret|rotate|rm <id>   send a test event, show / replace the secret, remove
//   smshub-cli webhook on|off <id>           switch an endpoint on (clears its failure count) or off
//   smshub-cli webhook events <id> <pattern>...   which events it gets (message.*, *, ...)
//   smshub-cli webhook log [<id>] [--limit 20]   recent deliveries
//   smshub-cli webhook retry <delivery-id>   send one delivery again
//   smshub-cli conversations [--line <number>] [--limit 20]   the inbox, optionally one line
//   smshub-cli thread <conversation-id> [--limit 50]   messages in one conversation
//   smshub-cli lines                        who shares each number (contacts book)
//   smshub-cli contacts <number> add --name Kim --cell +14155550123 [--digit 1] [--prefix K] [--forward-sms]
//   smshub-cli contacts <number> edit <contact-id> [--name ..] [--cell ..] [--digit 1|none] [--prefix K|none]
//   smshub-cli contacts <number> rm <contact-id>
//   smshub-cli contacts <number> share <other-number|none>   use another line's contacts and menu
//   smshub-cli voice <number> [--setup] [--force] [--record on|off]   where calls go; --setup plays the voice menu
//   smshub-cli recording <call-message-id> [--out call.mp3]   save a recorded call as MP3
//   smshub-cli alert "<message>" [--severity info|warning|critical] [--to +1...]   text or call you (Settings > Alerts)
//   smshub-cli alerts [--limit 20]           recent alerts and how each went out
//   smshub-cli vault                         key vault state: locked / unlocked (until), sealed provider keys
//   smshub-cli vault unlock [--ttl 8h]       unlock sending for 1h..7d (asks for your passphrase; only the derived key is sent)
//   smshub-cli vault lock                    lock now: sends fail as "locked" until the next unlock
//   smshub-cli tui                          live view of numbers and texts
//   smshub-cli mcp                          MCP over stdio, proxied to smshub.dev
//
// <number> is a number id or the number itself (+14155550123); --line also takes a line name ("Mom").
// Every command takes --json. SMSHUB_API_KEY and SMSHUB_URL override the config.

import { readFileSync, writeFileSync, mkdirSync, chmodSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { webcrypto } from "node:crypto";

const VERSION = "1.10.0";
const CONFIG_DIR = join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "smshub");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      const k = eq === -1 ? a.slice(2) : a.slice(2, eq);
      let v = eq === -1 ? undefined : a.slice(eq + 1);
      if (v === undefined) v = argv[i + 1] !== undefined && !argv[i + 1].startsWith("--") ? argv[++i] : true;
      // A flag given twice (--member a --member b) keeps both.
      out[k] = out[k] === undefined ? v : [].concat(out[k], v);
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
const webhookLine = (e) =>
  `${e.id}  ${e.enabled ? "on " : "OFF"}  ${e.url}  [${e.events.join(", ")}]${e.description ? `  ${e.description}` : ""}${e.failures ? `  ${e.failures} failures` : ""}${e.disabled_reason ? `  (${e.disabled_reason})` : ""}`;
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
      body: { area_code: args.area, months: Number(args.months || 1), chain: args.credit ? "CREDIT" : args.chain },
    });
    if (args.json && args["no-wait"]) return console.log(JSON.stringify(order, null, 2));
    if (!args.json) {
      console.log(`Order ${order.id}: $${Number(order.amount_usd).toFixed(2)} in ${order.chain}`);
      if (order.pay_url) console.log(`Pay here: ${order.pay_url}`);
    }
    if (order.status === "active" || order.status === "failed") {
      if (args.json) return console.log(JSON.stringify(order, null, 2));
      return console.log(order.status === "active" ? `Your number: ${order.number}` : `${order.status}: ${order.error || ""}`);
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
      body: { months: Number(args.months || 1), chain: args.credit ? "CREDIT" : args.chain },
    });
    print(args, order, (o) => console.log(o.pay_url ? `Pay here: ${o.pay_url}` : `${o.status}${o.number ? ": " + o.number : ""}`));
  },

  async redeem(args) {
    const code = args._[1] || args.code;
    if (!code) throw new ApiError("Usage: smshub-cli redeem <code>");
    const r = await api("/api/v1/redeem", { method: "POST", body: { code } });
    print(args, r, (r) => console.log(`Added $${Number(r.credit_usd).toFixed(2)}. Store credit: $${Number(r.balance_usd).toFixed(2)}`));
  },

  async credits(args) {
    const d = await api("/api/v1/credits");
    print(args, d, (d) => {
      console.log(`Store credit: $${d.balance_usd.toFixed(2)}  (pay with it: smshub-cli rent --credit)`);
      for (const h of d.history.slice(0, 10)) console.log(`${h.at.slice(0, 10)}  ${h.kind === "spend" ? "-" : "+"}$${h.amount_usd.toFixed(2)}  ${h.source}`);
    });
  },

  async invites(args) {
    if (args._[1] === "new") {
      const r = await api("/api/v1/invites", { method: "POST", body: { note: args.note } });
      return print(args, r, (r) => console.log(`Invite (shown once): ${r.url}`));
    }
    const d = await api("/api/v1/invites");
    print(args, d, (d) => {
      console.log(`${d.quota.left} of ${d.quota.total} invites left. Accepted invite: $${d.bonus_usd.toFixed(2)} credit each.`);
      for (const i of d.invites) console.log(`${i.created_at.slice(0, 10)}  ${i.used ? "accepted" : "open"}  ${i.note || ""}`);
      console.log(`Referral link: ${d.referral_link}`);
    });
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

  async alert(args) {
    const message = args._.slice(1).join(" ").trim() || (args.message === true ? "" : args.message || "");
    if (!message) throw new ApiError('What to say? smshub-cli alert "disk full on dev2"');
    const body = { message };
    if (args.severity) body.severity = args.severity;
    if (args.to) body.to = args.to;
    const res = await api("/api/v1/alerts", { method: "POST", body });
    print(args, res, (r) =>
      console.log(r.deduped ? `already sent at ${r.alert.created_at} (same alert within 10 minutes)` : `${r.alert.channels.join(" + ") || r.alert.status}: ${r.note}`)
    );
  },

  async alerts(args) {
    const { alerts } = await api(`/api/v1/alerts?limit=${Number(args.limit) || 20}`);
    print(args, alerts, (list) => {
      if (!list.length) return console.log("No alerts yet.");
      for (const a of list) {
        console.log(`${a.created_at.slice(0, 19).replace("T", " ")}  ${a.status === "failed" ? "FAILED" : a.channels.join("+")}  ${a.severity}  ${a.message}${a.error ? `  (${a.error})` : ""}`);
      }
    });
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

  async send(args) {
    const to = args._[1];
    const message = args._.slice(2).join(" ").trim() || (typeof args.message === "string" ? args.message : "");
    if (!to || !message) throw new ApiError('Usage: smshub-cli send +14155550123 "hello" [--from <number>]');
    const body = { to, message };
    if (args.from && args.from !== true) body.from = await resolveLine(String(args.from));
    if (args.media && args.media !== true) body.media_url = args.media;
    const res = await api("/api/v1/messages/send", { method: "POST", body });
    print(args, res, (r) => console.log(`sent ${r.from} -> ${r.to}  ${r.message?.id ?? ""}`));
  },

  async groups(args) {
    const { groups } = await api("/api/v1/groups");
    print(args, { groups }, () => {
      if (!groups.length) console.log('No groups. smshub-cli group create "Team" --member +14155550123=Kim');
      for (const g of groups) console.log(`${g.id}  ${g.name.padEnd(24)} ${String(g.member_count).padStart(3)} members  ${g.from ?? "(no number)"}${g.relay ? "  relay" : ""}${g.external_ref ? `  ${g.external_ref}` : ""}`);
    });
  },

  async group(args) {
    const sub = args._[1];
    const members = (list) =>
      list.filter(Boolean).map((m) => {
        const [phone, ...name] = String(m).split("=");
        return { phone, ...(name.length ? { name: name.join("=") } : {}) };
      });
    const show = (g) => {
      console.log(`${g.name}  (${g.id})${g.relay ? "  relay on" : ""}`);
      console.log(`from ${g.from ?? "(none: pass --from when sending)"}${g.external_ref ? `  ref ${g.external_ref}` : ""}`);
      for (const m of g.members ?? []) console.log(`  ${m.phone}  ${m.name ?? ""}${m.opted_out ? "  (STOPped)" : ""}`);
    };
    const id = (n = 2) => {
      const v = args._[n];
      if (!v) throw new ApiError("Which group? smshub-cli groups shows ids");
      return encodeURIComponent(v);
    };
    if (sub === "create") {
      const name = args._.slice(2).join(" ").trim();
      if (!name) throw new ApiError('Usage: smshub-cli group create "Team" [--from <number>] [--relay] [--member +1415...=Kim]');
      const list = [].concat(args.member ?? []).filter((m) => m !== true);
      const body = { name, members: members(list), relay: args.relay === true };
      if (args.from && args.from !== true) body.from = await resolveLine(String(args.from));
      return print(args, await api("/api/v1/groups", { method: "POST", body }), show);
    }
    if (sub === "add") return print(args, await api(`/api/v1/groups/${id()}/members`, { method: "POST", body: { members: members(args._.slice(3)) } }), show);
    if (sub === "remove") {
      if (!args._[3]) throw new ApiError("Usage: smshub-cli group remove <id> <phone>");
      return print(args, await api(`/api/v1/groups/${id()}/members/${encodeURIComponent(args._[3])}`, { method: "DELETE" }), show);
    }
    if (sub === "send") {
      const message = args._.slice(3).join(" ").trim();
      if (!message) throw new ApiError('Usage: smshub-cli group send <id> "message"');
      const body = { message };
      if (args.from && args.from !== true) body.from = await resolveLine(String(args.from));
      return print(args, await api(`/api/v1/groups/${id()}/send`, { method: "POST", body }), (r) =>
        console.log(`sent ${r.sent} from ${r.from}${r.failed ? `, ${r.failed} failed (${r.errors?.[0]?.error ?? ""})` : ""}${r.skipped ? `, ${r.skipped} skipped` : ""}`)
      );
    }
    if (sub === "relay") return print(args, await api(`/api/v1/groups/${id()}`, { method: "PATCH", body: { relay: args._[3] !== "off" } }), show);
    if (sub === "rm" || sub === "delete") return print(args, await api(`/api/v1/groups/${id()}`, { method: "DELETE" }), () => console.log("deleted"));
    if (!sub) throw new ApiError("Usage: smshub-cli group <id> | create | add | remove | send | relay | rm");
    return print(args, await api(`/api/v1/groups/${id(1)}`), show);
  },

  async webhooks(args) {
    const d = await api("/api/v1/webhooks");
    print(args, d, (d) => {
      if (!d.endpoints.length) console.log("No webhooks. smshub-cli webhook add https://example.com/smshub --event message.received");
      for (const e of d.endpoints) console.log(webhookLine(e));
      console.log(`\nEvents: ${d.event_types.join(", ")}`);
    });
  },

  async webhook(args) {
    const sub = args._[1];
    const base = "/api/v1/webhooks";
    const need = (n = 2, what = "Which webhook? smshub-cli webhooks shows ids") => {
      const v = args._[n];
      if (!v) throw new ApiError(what);
      return encodeURIComponent(v);
    };
    const showSecret = (r) => console.log(`Signing secret (keep it on your server): ${r.secret}`);
    if (sub === "add") {
      const url = args._[2] || (typeof args.url === "string" ? args.url : "");
      if (!url) throw new ApiError("Usage: smshub-cli webhook add <https-url> [--event message.received]...");
      const events = [].concat(args.event ?? [], args.events ?? []).filter((e) => e !== true).flatMap((e) => String(e).split(","));
      const body = { url, ...(events.length ? { events } : {}), ...(typeof args.description === "string" ? { description: args.description } : {}) };
      return print(args, await api(base, { method: "POST", body }), (r) => {
        console.log(webhookLine(r.endpoint));
        showSecret(r);
      });
    }
    if (sub === "test") return print(args, await api(`${base}/${need()}/test`, { method: "POST" }), (r) => console.log(r.ok ? `ok (${r.status})` : `failed: ${r.status ?? ""} ${r.error ?? ""}`));
    if (sub === "secret") return print(args, await api(`${base}/${need()}/secret`), showSecret);
    if (sub === "rotate") return print(args, await api(`${base}/${need()}/rotate`, { method: "POST" }), showSecret);
    if (sub === "rm" || sub === "delete") return print(args, await api(`${base}/${need()}`, { method: "DELETE" }), () => console.log("removed"));
    if (sub === "on" || sub === "off") return print(args, await api(`${base}/${need()}`, { method: "PATCH", body: { enabled: sub === "on" } }), (e) => console.log(webhookLine(e)));
    if (sub === "events") {
      const id = need();
      const events = args._.slice(3).flatMap((e) => String(e).split(",")).filter(Boolean);
      if (!events.length) throw new ApiError("Usage: smshub-cli webhook events <id> message.received message.failed");
      return print(args, await api(`${base}/${id}`, { method: "PATCH", body: { events } }), (e) => console.log(webhookLine(e)));
    }
    if (sub === "log") {
      const limit = Number(args.limit) || 20;
      const path = args._[2] ? `${base}/${encodeURIComponent(args._[2])}/deliveries?limit=${limit}` : `${base}/deliveries?limit=${limit}`;
      const { deliveries } = await api(path);
      return print(args, { deliveries }, () => {
        if (!deliveries.length) console.log("No deliveries yet.");
        for (const d of deliveries) {
          console.log(`${d.created_at.slice(0, 19).replace("T", " ")}  ${d.status.padEnd(9)} ${String(d.last_status ?? "").padEnd(4)} ${d.event_type}  ${d.id}${d.status !== "delivered" && d.last_error ? `  (${d.last_error})` : ""}`);
        }
      });
    }
    if (sub === "retry") return print(args, await api(`${base}/deliveries/${need(2, "Usage: smshub-cli webhook retry <delivery-id>")}/retry`, { method: "POST" }), (d) => console.log(`queued again: ${d.id}`));
    if (!sub) throw new ApiError("Usage: smshub-cli webhook add|<id>|test|secret|rotate|on|off|events|log|retry|rm");
    return print(args, await api(`${base}/${need(1)}`), (e) => console.log(webhookLine(e)));
  },

  async thread(args) {
    const id = args._[1];
    if (!id) throw new ApiError("Which conversation? smshub-cli conversations --json shows ids");
    const { messages } = await api(`/api/v1/messages?conversation_id=${encodeURIComponent(id)}`);
    const rows = messages.slice(-(Number(args.limit) || 50));
    print(args, { messages: rows }, () => {
      if (!rows.length) console.log("No messages.");
      for (const m of rows) console.log(`${m.created_at.slice(0, 19).replace("T", " ")}  ${m.direction === "outbound" ? ">" : "<"}  ${m.body ?? ""}${m.status === "failed" ? "  (FAILED)" : ""}`);
    });
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

  async vault(args) {
    const sub = args._[1] || "status";
    const show = (v) =>
      print(args, v, () => {
        const when = v.expires_at ? ` until ${v.expires_at.slice(0, 16).replace("T", " ")} UTC` : "";
        console.log(`vault: ${v.state === "no_vault" ? "not set up (create it at smshub.dev/settings)" : v.state + when}`);
        console.log(`provider keys: ${v.providers.sealed} sealed, ${v.providers.legacy_plaintext} not sealed yet, ${v.providers.needs_reentry} to re-enter`);
      });
    if (sub === "status") return show(await api("/api/vault"));
    if (sub === "lock") return show(await api("/api/vault/lock", { method: "POST" }));
    if (sub === "unlock") {
      const v = await api("/api/vault");
      if (!v.seal) throw new ApiError("No key vault yet: create one at https://smshub.dev/settings");
      const ttl = parseTtl(args.ttl);
      const passphrase = await askHidden("Vault passphrase: ");
      const dek = await openVaultDek(v.user_id, passphrase, v.seal);
      try {
        await api("/api/vault/unlock", { method: "POST", body: { dek: Buffer.from(dek).toString("base64"), ttl_seconds: ttl } });
      } finally {
        dek.fill(0);
      }
      const migrated = await api("/api/vault/migrate", { method: "POST" }).catch(() => null);
      if (migrated?.sealed && !args.json) console.log(`sealed ${migrated.sealed} provider key(s) that were stored unencrypted`);
      return show(await api("/api/vault"));
    }
    throw new ApiError("Usage: smshub-cli vault [status|unlock [--ttl 8h]|lock]");
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

// ---- key vault (same format as src/lib/vault/client-seal.ts) ---------------

function parseTtl(v) {
  if (v === undefined || v === true) return 8 * 3600;
  const m = /^(\d+)\s*([mhd]?)$/i.exec(String(v).trim());
  if (!m) throw new ApiError("--ttl takes e.g. 30m, 8h, 3d (max 7d)");
  const n = Number(m[1]) * ({ m: 60, h: 3600, d: 86400 }[m[2].toLowerCase()] ?? 3600);
  return Math.min(n, 7 * 86400);
}

function askHidden(prompt) {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY) return reject(new ApiError("vault unlock needs a terminal to ask for the passphrase"));
    process.stdout.write(prompt);
    const stdin = process.stdin;
    stdin.setRawMode(true);
    stdin.resume();
    let out = "";
    const onData = (buf) => {
      for (const ch of buf.toString("utf8")) {
        if (ch === "\r" || ch === "\n") {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off("data", onData);
          process.stdout.write("\n");
          return resolve(out);
        }
        if (ch === "\u0003") {
          stdin.setRawMode(false);
          process.exit(130);
        }
        if (ch === "\u007f" || ch === "\b") out = out.slice(0, -1);
        else out += ch;
      }
    };
    stdin.on("data", onData);
  });
}

async function openVaultDek(userId, passphrase, seal) {
  const subtle = webcrypto.subtle;
  const enc = new TextEncoder();
  const b64 = (s) => Uint8Array.from(Buffer.from(s, "base64"));
  if (seal.kdf.alg !== "PBKDF2-SHA256" || seal.kdf.iterations < 600000) throw new ApiError("Unsupported vault KDF");
  const salt = b64(seal.kdf.salt);
  const pw = await subtle.importKey("raw", enc.encode(passphrase.normalize("NFKC")), "PBKDF2", false, ["deriveBits"]);
  const bits = new Uint8Array(await subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: seal.kdf.iterations }, pw, 256));
  const base = await subtle.importKey("raw", bits, "HKDF", false, ["deriveKey"]);
  bits.fill(0);
  const kek = await subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt, info: enc.encode("smshub/kek/v2") }, base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
  const w = seal.wrapped_dek;
  const joined = new Uint8Array([...b64(w.ciphertext), ...b64(w.tag)]);
  try {
    return new Uint8Array(await subtle.decrypt({ name: "AES-GCM", iv: b64(w.iv), additionalData: enc.encode(`smshub:vault:${userId}:wrapped_dek`), tagLength: 128 }, kek, joined));
  } catch {
    throw new ApiError("Wrong passphrase");
  }
}
