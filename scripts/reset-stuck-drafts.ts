/**
 * One-time reset after merging DBs: set all leagues with draft_status 'active' or 'paused'
 * to 'completed' and clear draft_pick_started_at so the background job stops processing them.
 *
 * Run: npx tsx scripts/reset-stuck-drafts.ts
 * Requires DATABASE_URL in .env or environment.
 */
import "dotenv/config";
import dns from "dns";
dns.setDefaultResultOrder("ipv4first");

import { db } from "../server/db";
import { leagues } from "@shared/schema";
import { inArray } from "drizzle-orm";

async function main() {
  const result = await db
    .update(leagues)
    .set({ draftStatus: "completed", draftPickStartedAt: null })
    .where(inArray(leagues.draftStatus, ["active", "paused"]))
    .returning({ id: leagues.id, name: leagues.name });

  console.log(
    result.length > 0
      ? `Reset ${result.length} league(s) to draft completed: ${result.map((r) => r.name).join(", ")}`
      : "No leagues were in active/paused draft status."
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("Reset failed:", err.message);
  process.exit(1);
});
