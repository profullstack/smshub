import { createServiceClient } from "@/lib/supabase/server";
import { sweep } from "./service";

const INTERVAL_MS = 5 * 60 * 1000;
let started = false;

export function startSweeper(): void {
  if (started) return;
  started = true;
  const run = async () => {
    try {
      const r = await sweep({ db: createServiceClient() });
      if (r.retried || r.expiredCheckouts || r.released || r.errors.length) {
        console.warn("[managed-numbers] sweep", JSON.stringify(r));
      }
    } catch (e) {
      console.error("[managed-numbers] sweep failed:", e);
    }
  };
  setTimeout(run, 30_000);
  setInterval(run, INTERVAL_MS).unref?.();
}
