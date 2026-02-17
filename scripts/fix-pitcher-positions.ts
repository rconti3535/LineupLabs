import { db } from "../server/db";
import { players } from "../shared/schema";
import { eq, and } from "drizzle-orm";

const DELAY_MS = 200;

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchPitchingStats(mlbId: number): Promise<{ games: number; gamesStarted: number } | null> {
  try {
    const url = `https://statsapi.mlb.com/api/v1/people/${mlbId}/stats?stats=career&group=pitching`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();

    for (const statGroup of data.stats || []) {
      if (statGroup.group?.displayName === "pitching" && statGroup.splits?.length > 0) {
        const stat = statGroup.splits[0].stat;
        return {
          games: stat.gamesPlayed || 0,
          gamesStarted: stat.gamesStarted || 0,
        };
      }
    }
    return null;
  } catch {
    return null;
  }
}

async function fixPitcherPositions() {
  console.log("Fetching all SP players from database...");

  const allSPs = await db
    .select({ id: players.id, mlbId: players.mlbId, name: players.name, mlbLevel: players.mlbLevel })
    .from(players)
    .where(eq(players.position, "SP"));

  console.log(`Found ${allSPs.length} pitchers marked as SP`);

  const mlbPitchers = allSPs.filter(p => p.mlbId !== null);
  console.log(`${mlbPitchers.length} have MLB IDs to check`);

  let updatedToRP = 0;
  let keptAsSP = 0;
  let noStats = 0;
  let errors = 0;

  const BATCH_SIZE = 30;

  for (let i = 0; i < mlbPitchers.length; i += BATCH_SIZE) {
    const batch = mlbPitchers.slice(i, i + BATCH_SIZE);
    console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(mlbPitchers.length / BATCH_SIZE)} (${i + 1}-${Math.min(i + BATCH_SIZE, mlbPitchers.length)})`);

    const results = await Promise.all(
      batch.map(async (player) => {
        await sleep(Math.random() * DELAY_MS);
        const stats = await fetchPitchingStats(player.mlbId!);
        return { player, stats };
      })
    );

    for (const { player, stats } of results) {
      if (!stats || stats.games === 0) {
        noStats++;
        continue;
      }

      try {
        const startPct = stats.gamesStarted / stats.games;
        if (startPct < 0.5) {
          await db.update(players).set({ position: "RP" }).where(eq(players.id, player.id));
          updatedToRP++;
        } else {
          keptAsSP++;
        }
      } catch (e) {
        errors++;
        console.error(`Error updating ${player.name}:`, e);
      }
    }

    if (i + BATCH_SIZE < mlbPitchers.length) {
      await sleep(300);
    }
  }

  console.log(`\nPitcher position fix complete!`);
  console.log(`  Updated to RP: ${updatedToRP}`);
  console.log(`  Kept as SP: ${keptAsSP}`);
  console.log(`  No stats (left as SP): ${noStats}`);
  console.log(`  Errors: ${errors}`);

  const rpCount = await db.select({ id: players.id }).from(players).where(eq(players.position, "RP"));
  const spCount = await db.select({ id: players.id }).from(players).where(eq(players.position, "SP"));
  console.log(`\nFinal counts: SP=${spCount.length}, RP=${rpCount.length}`);

  process.exit(0);
}

fixPitcherPositions().catch(err => {
  console.error("Fix failed:", err);
  process.exit(1);
});
