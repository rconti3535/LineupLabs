import { db } from "../server/db";
import { players } from "../shared/schema";
import { eq, isNotNull } from "drizzle-orm";

const MLB_API = "https://statsapi.mlb.com/api/v1";

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed: ${url} (${res.status})`);
  return res.json();
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function importStats() {
  console.log("Fetching all players with mlbId...");
  const allPlayers = await db.select({ id: players.id, mlbId: players.mlbId, position: players.position })
    .from(players)
    .where(isNotNull(players.mlbId));

  console.log(`Found ${allPlayers.length} players with MLB IDs`);

  const BATCH_SIZE = 50;
  let updated = 0;
  let skipped = 0;
  let errors = 0;

  const isPitcher = (pos: string) => ["SP", "RP", "P", "CL"].includes(pos);

  for (let i = 0; i < allPlayers.length; i += BATCH_SIZE) {
    const batch = allPlayers.slice(i, i + BATCH_SIZE);
    const promises = batch.map(async (player) => {
      try {
        const pitcher = isPitcher(player.position);
        const group = pitcher ? "pitching" : "hitting";
        const data = await fetchJson(
          `${MLB_API}/people/${player.mlbId}/stats?stats=season&group=${group}&season=2025`
        );

        const splits = data?.stats?.[0]?.splits;
        if (!splits || splits.length === 0) {
          skipped++;
          return;
        }

        const s = splits[0].stat;

        if (pitcher) {
          await db.update(players).set({
            statW: s.wins || 0,
            statL: s.losses || 0,
            statSV: s.saves || 0,
            statHLD: s.holds || 0,
            statERA: s.era || "0.00",
            statWHIP: s.whip || "0.00",
            statSO: s.strikeOuts || 0,
            statIP: s.inningsPitched || "0.0",
            statBBp: s.baseOnBalls || 0,
            statHRp: s.homeRuns || 0,
            statCG: s.completeGames || 0,
            statSHO: s.shutouts || 0,
            statBSV: s.blownSaves || 0,
            statER: s.earnedRuns || 0,
            statHA: s.hits || 0,
            statQS: 0,
          }).where(eq(players.id, player.id));
        } else {
          const tb = (s.hits || 0) + (s.doubles || 0) + (s.triples || 0) * 2 + (s.homeRuns || 0) * 3;
          await db.update(players).set({
            statR: s.runs || 0,
            statHR: s.homeRuns || 0,
            statRBI: s.rbi || 0,
            statSB: s.stolenBases || 0,
            statAVG: s.avg || ".000",
            statH: s.hits || 0,
            stat2B: s.doubles || 0,
            stat3B: s.triples || 0,
            statBB: s.baseOnBalls || 0,
            statK: s.strikeOuts || 0,
            statOBP: s.obp || ".000",
            statSLG: s.slg || ".000",
            statOPS: s.ops || ".000",
            statTB: tb,
            statCS: s.caughtStealing || 0,
            statHBP: s.hitByPitch || 0,
            statAB: s.atBats || 0,
            statPA: s.plateAppearances || 0,
          }).where(eq(players.id, player.id));
        }
        updated++;
      } catch {
        errors++;
      }
    });

    await Promise.all(promises);
    console.log(`Progress: ${Math.min(i + BATCH_SIZE, allPlayers.length)}/${allPlayers.length} (updated: ${updated}, skipped: ${skipped}, errors: ${errors})`);
    await delay(200);
  }

  console.log(`\nDone! Updated: ${updated}, Skipped: ${skipped}, Errors: ${errors}`);
  process.exit(0);
}

importStats().catch(err => { console.error(err); process.exit(1); });
