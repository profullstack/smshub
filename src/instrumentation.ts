/**
 * Runs once when the server boots. Starts the managed-number sweep (retry
 * provisioning, expire abandoned checkouts, warn about and release lapsed
 * rentals) and the customer-webhook drainer, so nothing depends on a cron
 * entry somebody has to remember to add.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NODE_ENV !== "production") return;
  // Deploy handoff: deploy-app.sh passes vault unlocks from the old container
  // to the new one over a private Unix socket (scripts/vault-handoff.sh), so a
  // redeploy no longer locks every vault.
  try {
    const { startVaultHandoffSocket } = await import("@/lib/vault/handoff");
    startVaultHandoffSocket();
  } catch (err) {
    console.error("[vault] handoff socket failed to start", err instanceof Error ? err.message : err);
  }
  if (process.env[String("WEBHOOKS_DRAIN")] !== "off") {
    const { startWebhooks } = await import("@/lib/webhooks/hub");
    startWebhooks();
  }
  if (process.env[String("MANAGED_NUMBERS_SWEEP")] === "off") return;
  const { startSweeper } = await import("@/lib/managed-numbers/sweeper");
  startSweeper();
}
