#!/usr/bin/env node
// Wait for the next one-time code on an smshub number, over the REST API.
//
//   SMSHUB_API_KEY=smshub_... node wait-for-code.mjs                 list your numbers
//   SMSHUB_API_KEY=smshub_... node wait-for-code.mjs <number> [--timeout 300]
//
// <number> is a number id or the number itself (+14155550123). The code goes to
// stdout and nothing else, so `CODE=$(node wait-for-code.mjs +1...)` works.
// Exit codes: 0 code printed, 1 error, 2 no code before the timeout.
//
// Node 18 or newer, no dependencies. SMSHUB_URL overrides https://smshub.dev.

const BASE = (process.env.SMSHUB_URL || "https://smshub.dev").replace(/\/+$/, "");
const KEY = process.env.SMSHUB_API_KEY || "";
const MAX_WAIT = 55; // the server holds a request open at most this long

class ApiError extends Error {}

function fail(message, code = 1) {
  console.error(message);
  process.exit(code);
}

async function api(path) {
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      headers: { "X-API-Key": KEY, Accept: "application/json", "User-Agent": "smshub-agent-inbox-example" },
      signal: AbortSignal.timeout((MAX_WAIT + 15) * 1000),
    });
  } catch (error) {
    throw new ApiError(`network: ${error instanceof Error ? error.message : String(error)}`);
  }
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { error: text.slice(0, 200) };
  }
  if (!res.ok) {
    const err = new ApiError(`HTTP ${res.status}: ${json.error || res.statusText}`);
    err.status = res.status;
    throw err;
  }
  return json;
}

async function listNumbers() {
  const { numbers } = await api("/api/v1/numbers");
  if (!numbers.length) {
    console.log("No numbers on this account yet. Rent one at https://smshub.dev/numbers (or `npx -y @profullstack/smshub rent`).");
    return;
  }
  for (const n of numbers) {
    console.log(`${n.number}  ${n.id}  ${n.managed ? `rented, paid until ${String(n.expires_at).slice(0, 10)}` : "your provider"}`);
  }
}

async function resolveNumberId(ref) {
  if (!ref.startsWith("+")) return ref;
  const { numbers } = await api("/api/v1/numbers");
  const hit = numbers.find((n) => n.number === ref);
  if (!hit) throw new ApiError(`${ref} is not on this account (run without arguments to list your numbers)`);
  return hit.id;
}

async function waitForCode(numberId, timeoutSeconds) {
  // Only texts that arrive after we start count, so an old code is never returned.
  let since = new Date().toISOString();
  const deadline = Date.now() + timeoutSeconds * 1000;
  let backoff = 2000;
  for (;;) {
    const left = Math.max(0, Math.min(MAX_WAIT, Math.ceil((deadline - Date.now()) / 1000)));
    const q = new URLSearchParams({ since, wait: String(left), limit: "20" });
    try {
      const { messages } = await api(`/api/v1/numbers/${encodeURIComponent(numberId)}/messages?${q}`);
      backoff = 2000;
      // Newest first. Take the oldest new text that has a code.
      const hit = [...messages].reverse().find((m) => m.otp);
      if (hit) return hit;
      if (messages[0]) since = messages[0].received_at;
    } catch (error) {
      // 401/403/404 will not get better by retrying. 429, 5xx and dropped connections might.
      const status = error instanceof ApiError ? error.status : undefined;
      if (status && status !== 429 && status < 500) throw error;
      console.error(`${error.message}; retrying in ${backoff / 1000}s`);
      await new Promise((r) => setTimeout(r, backoff));
      backoff = Math.min(backoff * 2, 30_000);
    }
    if (Date.now() >= deadline) return null;
  }
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--timeout") out.timeout = argv[++i];
    else if (a.startsWith("--timeout=")) out.timeout = a.slice(10);
    else if (a === "-h" || a === "--help") out.help = true;
    else out._.push(a);
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log("usage: SMSHUB_API_KEY=smshub_... node wait-for-code.mjs [<number-id | +E164>] [--timeout 300]");
    return;
  }
  if (!KEY) fail("Set SMSHUB_API_KEY (create a key at https://smshub.dev/settings/api-keys).");
  if (!/^https:\/\/|^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) {
    fail(`Refusing to send the API key to ${BASE}: use an https:// URL.`);
  }
  const ref = args._[0];
  if (!ref) return listNumbers();

  const timeout = Number(args.timeout ?? 300);
  if (!Number.isFinite(timeout) || timeout < 1) fail("--timeout must be a number of seconds, 1 or more.");
  const id = await resolveNumberId(ref);
  console.error(`Waiting up to ${timeout}s for a code on ${ref}...`);
  const hit = await waitForCode(id, timeout);
  if (!hit) fail("No code arrived before the timeout.", 2);
  console.log(hit.otp);
}

main().catch((error) => fail(error instanceof ApiError ? error.message : String(error?.stack || error)));
