/**
 * Best Ball weekly standings backfill runner.
 *
 * This invokes the shared backfill entrypoint, which now handles both:
 * - Season Points + Best Ball snapshots
 * - Roto + Best Ball weekly snapshots
 *
 * Usage:
 *   npx tsx scripts/backfill-weekly-roto-bestball.ts
 */
import { backfillWeeklyBestBallSnapshots } from "../server/scoring";

async function main() {
  const result = await backfillWeeklyBestBallSnapshots(new Date());
  console.log("[Backfill][Weekly Best Ball] completed:", result);
}

main().catch((error) => {
  console.error("[Backfill][Weekly Best Ball] failed:", error);
  process.exit(1);
});
