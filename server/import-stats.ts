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

async function fetchPlayerStats(mlbId: number, season?: number): Promise<{ hitting: MLBHittingStats | null; pitching: MLBPitchingStats | null }> {
  try {
    const targetSeason = season || SEASON;
    const url = `https://statsapi.mlb.com/api/v1/people/${mlbId}/stats?stats=season&season=${targetSeason}&group=hitting,pitching`;
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

function buildHittingUpdate(hitting: MLBHittingStats, prefix: "stat" | "s26"): Record<string, unknown> {
  const d: Record<string, unknown> = {};
  d[`${prefix}R`] = hitting.runs || 0;
  d[`${prefix}HR`] = hitting.homeRuns || 0;
  d[`${prefix}RBI`] = hitting.rbi || 0;
  d[`${prefix}SB`] = hitting.stolenBases || 0;
  d[`${prefix}AVG`] = hitting.avg || ".000";
  d[`${prefix}H`] = hitting.hits || 0;
  d[`${prefix}2B`] = hitting.doubles || 0;
  d[`${prefix}3B`] = hitting.triples || 0;
  d[`${prefix}BB`] = hitting.baseOnBalls || 0;
  d[`${prefix}K`] = hitting.strikeOuts || 0;
  d[`${prefix}OBP`] = hitting.obp || ".000";
  d[`${prefix}SLG`] = hitting.slg || ".000";
  d[`${prefix}OPS`] = hitting.ops || ".000";
  d[`${prefix}TB`] = hitting.totalBases || 0;
  d[`${prefix}CS`] = hitting.caughtStealing || 0;
  d[`${prefix}HBP`] = hitting.hitByPitch || 0;
  d[`${prefix}AB`] = hitting.atBats || 0;
  d[`${prefix}PA`] = hitting.plateAppearances || 0;
  return d;
}

function buildPitchingUpdate(pitching: MLBPitchingStats, prefix: "stat" | "s26"): Record<string, unknown> {
  const d: Record<string, unknown> = {};
  d[`${prefix}W`] = pitching.wins || 0;
  d[`${prefix}SV`] = pitching.saves || 0;
  d[`${prefix}ERA`] = pitching.era || "0.00";
  d[`${prefix}WHIP`] = pitching.whip || "0.00";
  d[`${prefix}L`] = pitching.losses || 0;
  d[`${prefix}SO`] = pitching.strikeOuts || 0;
  d[`${prefix}IP`] = pitching.inningsPitched || "0.0";
  d[`${prefix}BBp`] = pitching.baseOnBalls || 0;
  d[`${prefix}HRp`] = pitching.homeRuns || 0;
  d[`${prefix}CG`] = pitching.completeGames || 0;
  d[`${prefix}SHO`] = pitching.shutouts || 0;
  d[`${prefix}BSV`] = pitching.blownSaves || 0;
  d[`${prefix}ER`] = pitching.earnedRuns || 0;
  d[`${prefix}HA`] = pitching.hits || 0;
  d[`${prefix}IPOuts`] = parseIP(pitching.inningsPitched) || pitching.outs || 0;
  d[`${prefix}HLD`] = pitching.holds || 0;
  return d;
}

export async function importSeasonStats(season?: number) {
  const targetSeason = season || SEASON;
  const prefix: "stat" | "s26" = targetSeason === 2026 ? "s26" : "stat";
  console.log(`Fetching ${targetSeason} MLB season stats (writing to ${prefix}* fields)...`);

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
        const stats = await fetchPlayerStats(player.mlbId!, targetSeason);
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

        if (hitting) Object.assign(updateData, buildHittingUpdate(hitting, prefix));
        if (pitching) Object.assign(updateData, buildPitchingUpdate(pitching, prefix));

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
