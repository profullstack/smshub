/**
 * Re-check Telnyx messages still marked "sent" and record their real delivery
 * outcome (delivered / failed + carrier error) from GET /v2/messages/{id}.
 * For rows sent before smshub received message.finalized webhooks.
 *
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... TELNYX_API_KEY=... \
 *     bun scripts/telnyx-backfill-status.ts [--days 30] [--dry-run]
 *
 * TELNYX_API_KEY must belong to the account that sent the messages; rows the
 * key cannot see (404) are skipped.
 */
import { createClient } from "@supabase/supabase-js";
import { applyTelnyxStatus, parseTelnyxMessage } from "../src/lib/providers/telnyx-status";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const daysArg = args.indexOf("--days");
const days = daysArg >= 0 ? Number(args[daysArg + 1]) : 30;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const apiKey = process.env.TELNYX_API_KEY;
if (!url || !serviceKey || !apiKey) {
  console.error("Need NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and TELNYX_API_KEY");
  process.exit(2);
}

const supabase = createClient(url, serviceKey);
const since = new Date(Date.now() - days * 86_400_000).toISOString();

const { data: rows, error } = await supabase
  .from("messages")
  .select("id, provider_message_id")
  .eq("provider", "telnyx")
  .eq("direction", "outbound")
  .eq("status", "sent")
  .not("provider_message_id", "is", null)
  .gte("created_at", since);

if (error) {
  console.error("Query failed:", error.message);
  process.exit(1);
}

let changed = 0;
for (const row of rows ?? []) {
  const res = await fetch(`https://api.telnyx.com/v2/messages/${row.provider_message_id}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    console.log(`${row.id} skip: Telnyx ${res.status}`);
    continue;
  }
  const update = parseTelnyxMessage((await res.json()).data);
  if (!update || update.status === "sent") {
    console.log(`${row.id} unchanged`);
    continue;
  }
  console.log(`${row.id} -> ${update.status}${update.errorCode ? ` ${update.errorCode}` : ""}`);
  if (!dryRun) {
    const { error: updErr } = await applyTelnyxStatus(supabase, update);
    if (updErr) console.error(`${row.id} update failed: ${updErr.message}`);
    else changed++;
  }
}

console.log(`${rows?.length ?? 0} checked, ${changed} updated${dryRun ? " (dry run)" : ""}`);
