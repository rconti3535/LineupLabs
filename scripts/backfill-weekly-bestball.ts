/**
 * Backfill weekly best-ball snapshots for active Season Points Best Ball leagues.
 *
 * Run: npx tsx scripts/backfill-weekly-bestball.ts
 */
import "dotenv/config";
import dns from "dns";
dns.setDefaultResultOrder("ipv4first");

import { backfillWeeklyBestBallSnapshots } from "../server/scoring";

async function main() {
  const result = await backfillWeeklyBestBallSnapshots(new Date());
  console.log(
    `[Best Ball Weekly] Backfill complete: leagues=${result.leagues}, snapshots=${result.snapshots}`,
  );
  process.exit(0);
}

main().catch((error) => {
  console.error("[Best Ball Weekly] Backfill failed:", (error as Error).message);
  process.exit(1);
});
