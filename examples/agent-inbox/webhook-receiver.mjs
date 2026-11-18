#!/usr/bin/env node
// Receive smshub webhooks, check the signature, and print each incoming text.
//
//   SMSHUB_WEBHOOK_SECRET=whsec_... PORT=8787 node webhook-receiver.mjs
//
// smshub signs every delivery the Standard Webhooks way
// (https://www.standardwebhooks.com/):
//   webhook-id         the event id, the same on every retry (dedupe on it)
//   webhook-timestamp  unix seconds
//   webhook-signature  "v1," + base64(HMAC-SHA256(key, `${id}.${timestamp}.${rawBody}`))
// where key is the base64-decoded part of the secret after "whsec_". The body is
// a CloudEvents 1.0 JSON object: { specversion, id, type, source, subject, time, data }.
//
// smshub only delivers to a public https:// URL, so put this behind a TLS
// reverse proxy or an HTTPS tunnel. Node 18 or newer, no dependencies.

import { createHmac, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";

const TOLERANCE_SECONDS = 300;
const MAX_BODY_BYTES = 1024 * 1024;

function header(headers, name) {
  const v = headers?.[name] ?? headers?.[name.toLowerCase()];
  return Array.isArray(v) ? v.join(" ") : v == null ? null : String(v);
}

/** HMAC key bytes from a whsec_ secret (base64 after the prefix). */
function keyOf(secret) {
  if (typeof secret !== "string" || !secret.startsWith("whsec_")) throw new Error("secret must start with whsec_");
  const key = Buffer.from(secret.slice("whsec_".length), "base64");
  if (key.length === 0) throw new Error("secret has no key bytes");
  return key;
}

/**
 * Check one delivery. `headers` is a plain object with lower-case names (as
 * node:http gives them), `body` the raw request body (string or Buffer), never
 * re-serialised JSON. Returns { ok: true, event } or { ok: false, reason }.
 */
export function verifyWebhook({ headers, body, secret, toleranceSeconds = TOLERANCE_SECONDS, now = Date.now() }) {
  const id = header(headers, "webhook-id");
  const ts = header(headers, "webhook-timestamp");
  const sig = header(headers, "webhook-signature");
  if (!id || !ts || !sig) return { ok: false, reason: "missing webhook-id, webhook-timestamp or webhook-signature" };
  if (!/^\d+$/.test(ts.trim())) return { ok: false, reason: "bad webhook-timestamp" };
  const timestamp = Number(ts.trim());
  if (Math.abs(Math.floor(now / 1000) - timestamp) > toleranceSeconds) return { ok: false, reason: "timestamp too old or in the future" };

  const raw = Buffer.isBuffer(body) ? body : Buffer.from(String(body), "utf8");
  let expected;
  try {
    expected = createHmac("sha256", keyOf(secret)).update(`${id}.${timestamp}.`).update(raw).digest();
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
  // The header may hold several space-separated signatures (during a secret rotation).
  let matched = false;
  for (const entry of sig.split(" ")) {
    const [version, value] = entry.split(",", 2);
    if (version !== "v1" || !value) continue;
    const given = Buffer.from(value, "base64");
    if (given.length === expected.length && timingSafeEqual(given, expected)) matched = true;
  }
  if (!matched) return { ok: false, reason: "signature mismatch" };

  let event;
  try {
    event = JSON.parse(raw.toString("utf8"));
  } catch {
    return { ok: false, reason: "body is not JSON" };
  }
  return { ok: true, id, event };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("body too large"));
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export function createReceiver({ secret, onEvent = printEvent }) {
  keyOf(secret); // fail at start-up, not on the first delivery
  const seen = new Set();
  return createServer(async (req, res) => {
    if (req.method !== "POST") {
      res.writeHead(405, { Allow: "POST" }).end();
      return;
    }
    let body;
    try {
      body = await readBody(req);
    } catch {
      res.writeHead(413).end();
      return;
    }
    const r = verifyWebhook({ headers: req.headers, body, secret });
    if (!r.ok) {
      console.error(`rejected: ${r.reason}`);
      res.writeHead(401, { "Content-Type": "application/json" }).end(JSON.stringify({ error: r.reason }));
      return;
    }
    // Answer fast (smshub waits 10 s), and only once per event id: retries reuse it.
    res.writeHead(204).end();
    if (seen.has(r.id)) return;
    seen.add(r.id);
    if (seen.size > 10_000) seen.delete(seen.values().next().value);
    try {
      await onEvent(r.event);
    } catch (error) {
      console.error("handler failed:", error);
    }
  });
}

function printEvent(event) {
  if (event.type === "message.received") {
    const d = event.data ?? {};
    console.log(JSON.stringify({ type: event.type, id: event.id, number: d.number, from: d.from, otp: d.otp, body: d.body, received_at: d.received_at }));
  } else {
    console.log(JSON.stringify({ type: event.type, id: event.id }));
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const secret = process.env.SMSHUB_WEBHOOK_SECRET;
  if (!secret) {
    console.error("Set SMSHUB_WEBHOOK_SECRET to the whsec_ secret printed by `smshub-cli webhook add`.");
    process.exit(1);
  }
  const port = Number(process.env.PORT || 8787);
  let server;
  try {
    server = createReceiver({ secret });
  } catch (error) {
    console.error(`SMSHUB_WEBHOOK_SECRET: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
  server.listen(port, () => console.error(`listening on http://localhost:${port} (POST only)`));
}
