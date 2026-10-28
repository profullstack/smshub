/**
 * Runs once when the server boots. Starts the managed-number sweep (retry
 * provisioning, expire abandoned checkouts, warn about and release lapsed
 * rentals) and the customer-webhook drainer, so nothing depends on a cron
 * entry somebody has to remember to add.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NODE_ENV !== "production") return;
  if (process.env[String("WEBHOOKS_DRAIN")] !== "off") {
    const { startWebhooks } = await import("@/lib/webhooks/hub");
    startWebhooks();
  }
  if (process.env[String("MANAGED_NUMBERS_SWEEP")] === "off") return;
  const { startSweeper } = await import("@/lib/managed-numbers/sweeper");
  startSweeper();
}
