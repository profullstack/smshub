#!/usr/bin/env node
// Mint a smshub.dev credit code (store credit that pays for rented numbers).
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/mint-credit-code.mjs --usd 10 --label "for Kim"
//     [--max 1]           how many accounts may redeem it (default 1)
//     [--expires 30d]     days until it stops working (default: never)
//     [--by riotcoder]    who minted it, for the audit trail
//   ... node scripts/mint-credit-code.mjs --list
//   ... node scripts/mint-credit-code.mjs --revoke crd_xxx
//
// On dev2 with the app's env: set -a; . /home/anthony/www/smshub.dev/app.env; set +a
// The plaintext code is printed once; only its sha256 is stored.

import { createClient } from "@supabase/supabase-js";
import { Credits, supabaseStore } from "@profullstack/redeem-credits";

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const credits = new Credits(supabaseStore(createClient(url, key, { auth: { persistSession: false } })));

if (args.includes("--list")) {
  for (const c of await credits.list()) {
    console.log(`${c.id}  ${c.grant.unit}=${c.grant.amount}  ${c.redemptions}/${c.maxRedemptions}  ${c.revokedAt ? "revoked" : "live"}  ${c.label}`);
  }
  process.exit(0);
}
if (opt("revoke")) {
  await credits.revoke(opt("revoke"));
  console.log(`revoked ${opt("revoke")}`);
  process.exit(0);
}

const usd = Number(opt("usd"));
if (!Number.isFinite(usd) || usd <= 0 || usd > 1000) {
  console.error("--usd <amount> is required (0 < usd <= 1000)");
  process.exit(1);
}
const days = opt("expires") ? Number(String(opt("expires")).replace(/d$/, "")) : null;
const minted = await credits.mint({
  grant: { unit: "usd_cents", amount: Math.round(usd * 100) },
  label: opt("label") || `smshub $${usd}`,
  maxRedemptions: Number(opt("max") || 1),
  expiresAt: days ? Date.now() + days * 86400_000 : null,
  createdBy: opt("by") || "admin",
});
console.log(JSON.stringify({ code: minted.code, id: minted.id, usd, max: minted.maxRedemptions, expires_at: minted.expiresAt }, null, 2));
console.log(`Redeem at https://smshub.dev/settings#redeem`);
