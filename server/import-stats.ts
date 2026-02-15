import { db } from "./db";
import { players } from "@shared/schema";
import { eq, isNotNull, and } from "drizzle-orm";

const SEASON = 2025;
const BATCH_SIZE = 50;
const DELAY_MS = 200;

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

interface MLBHittingStats {
  runs?: number;
  homeRuns?: number;
  rbi?: number;
  stolenBases?: number;
  avg?: string;
  hits?: number;
  doubles?: number;
  triples?: number;
  baseOnBalls?: number;
  strikeOuts?: number;
  obp?: string;
  slg?: string;
  ops?: string;
  totalBases?: number;
  caughtStealing?: number;
  hitByPitch?: number;
  atBats?: number;
  plateAppearances?: number;
}

interface MLBPitchingStats {
  wins?: number;
  saves?: number;
  era?: string;
  whip?: string;
  losses?: number;
  strikeOuts?: number;
  inningsPitched?: string;
  baseOnBalls?: number;
  homeRuns?: number;
  completeGames?: number;
  shutouts?: number;
  blownSaves?: number;
  earnedRuns?: number;
  hits?: number;
  holds?: number;
  outs?: number;
}

async function fetchPlayerStats(mlbId: number): Promise<{ hitting: MLBHittingStats | null; pitching: MLBPitchingStats | null }> {
  try {
    const url = `https://statsapi.mlb.com/api/v1/people/${mlbId}/stats?stats=season&season=${SEASON}&group=hitting,pitching`;
    const res = await fetch(url);
    if (!res.ok) return { hitting: null, pitching: null };

    const data = await res.json();
    let hitting: MLBHittingStats | null = null;
    let pitching: MLBPitchingStats | null = null;

    for (const statGroup of data.stats || []) {
      if (statGroup.group?.displayName === "hitting" && statGroup.splits?.length > 0) {
        hitting = statGroup.splits[0].stat;
      }
      if (statGroup.group?.displayName === "pitching" && statGroup.splits?.length > 0) {
        pitching = statGroup.splits[0].stat;
      }
    }

    return { hitting, pitching };
  } catch {
    return { hitting: null, pitching: null };
  }
}

function parseIP(ip: string | undefined): number {
  if (!ip) return 0;
  const parts = ip.split(".");
  const whole = parseInt(parts[0]) || 0;
  const fraction = parseInt(parts[1]) || 0;
  return whole * 3 + fraction;
}

export async function importSeasonStats() {
  console.log(`Fetching ${SEASON} MLB season stats...`);

  const allPlayers = await db
    .select({ id: players.id, mlbId: players.mlbId, name: players.name, position: players.position })
    .from(players)
    .where(and(eq(players.mlbLevel, "MLB"), isNotNull(players.mlbId)));

  console.log(`Found ${allPlayers.length} MLB players to update`);

  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (let i = 0; i < allPlayers.length; i += BATCH_SIZE) {
    const batch = allPlayers.slice(i, i + BATCH_SIZE);
    console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(allPlayers.length / BATCH_SIZE)} (${i + 1}-${Math.min(i + BATCH_SIZE, allPlayers.length)})`);

    const results = await Promise.all(
      batch.map(async (player) => {
        await sleep(Math.random() * DELAY_MS);
        const stats = await fetchPlayerStats(player.mlbId!);
        return { player, stats };
      })
    );

    for (const { player, stats } of results) {
      const { hitting, pitching } = stats;

      if (!hitting && !pitching) {
        skipped++;
        continue;
      }

      try {
        const updateData: Record<string, unknown> = {};

        if (hitting) {
          updateData.statR = hitting.runs || 0;
          updateData.statHR = hitting.homeRuns || 0;
          updateData.statRBI = hitting.rbi || 0;
          updateData.statSB = hitting.stolenBases || 0;
          updateData.statAVG = hitting.avg || ".000";
          updateData.statH = hitting.hits || 0;
          updateData.stat2B = hitting.doubles || 0;
          updateData.stat3B = hitting.triples || 0;
          updateData.statBB = hitting.baseOnBalls || 0;
          updateData.statK = hitting.strikeOuts || 0;
          updateData.statOBP = hitting.obp || ".000";
          updateData.statSLG = hitting.slg || ".000";
          updateData.statOPS = hitting.ops || ".000";
          updateData.statTB = hitting.totalBases || 0;
          updateData.statCS = hitting.caughtStealing || 0;
          updateData.statHBP = hitting.hitByPitch || 0;
          updateData.statAB = hitting.atBats || 0;
          updateData.statPA = hitting.plateAppearances || 0;
        }

        if (pitching) {
          updateData.statW = pitching.wins || 0;
          updateData.statSV = pitching.saves || 0;
          updateData.statERA = pitching.era || "0.00";
          updateData.statWHIP = pitching.whip || "0.00";
          updateData.statL = pitching.losses || 0;
          updateData.statSO = pitching.strikeOuts || 0;
          updateData.statIP = pitching.inningsPitched || "0.0";
          updateData.statBBp = pitching.baseOnBalls || 0;
          updateData.statHRp = pitching.homeRuns || 0;
          updateData.statCG = pitching.completeGames || 0;
          updateData.statSHO = pitching.shutouts || 0;
          updateData.statBSV = pitching.blownSaves || 0;
          updateData.statER = pitching.earnedRuns || 0;
          updateData.statHA = pitching.hits || 0;
          updateData.statIPOuts = parseIP(pitching.inningsPitched) || pitching.outs || 0;
          updateData.statHLD = pitching.holds || 0;
        }

        await db.update(players).set(updateData).where(eq(players.id, player.id));
        updated++;
      } catch (e) {
        errors++;
        console.error(`Error updating ${player.name}:`, e);
      }
    }

    if (i + BATCH_SIZE < allPlayers.length) {
      await sleep(500);
    }
  }

  console.log(`\nStats import complete!`);
  console.log(`  Updated: ${updated}`);
  console.log(`  Skipped (no stats): ${skipped}`);
  console.log(`  Errors: ${errors}`);

  return { updated, skipped, errors };
}
