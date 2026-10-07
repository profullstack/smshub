/**
 * Runs once when the server boots. Starts the managed-number sweep (retry
 * provisioning, expire abandoned checkouts, release lapsed rentals) so nothing
 * depends on a cron entry somebody has to remember to add.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NODE_ENV !== "production" || process.env[String("MANAGED_NUMBERS_SWEEP")] === "off") return;
  const { startSweeper } = await import("@/lib/managed-numbers/sweeper");
  startSweeper();
}
