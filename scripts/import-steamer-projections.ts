import { db } from "../server/db";
import { players } from "../shared/schema";
import { eq, isNotNull } from "drizzle-orm";

const STEAMER_BATTING_URL = "https://www.fangraphs.com/api/steamer/batting";
const STEAMER_PITCHING_URL = "https://www.fangraphs.com/api/steamer/pitching";

const BATTING_POSITIONS = ["c", "1b", "2b", "3b", "ss", "lf", "cf", "rf", "dh", "of"];
const PITCHING_POSITIONS = ["sp", "rp"];

async function fetchJson(url: string) {
  const res = await fetch(url, {
    headers: { "User-Agent": "FantasyBaseballApp/1.0" },
  });
  if (!res.ok) throw new Error(`Failed: ${url} (${res.status})`);
  return res.json();
}

async function importProjections() {
  console.log("Fetching all players with mlbId...");
  const allPlayers = await db.select({ id: players.id, mlbId: players.mlbId })
    .from(players)
    .where(isNotNull(players.mlbId));

  const mlbIdMap = new Map<number, number>();
  allPlayers.forEach(p => { if (p.mlbId) mlbIdMap.set(p.mlbId, p.id); });
  console.log(`Found ${allPlayers.length} players`);

  console.log("\nFetching Steamer batting projections by position...");
  const seenBatters = new Set<number>();
  const allBatters: any[] = [];
  for (const pos of BATTING_POSITIONS) {
    const data: any[] = await fetchJson(`${STEAMER_BATTING_URL}?pos=${pos}`);
    for (const b of data) {
      if (!seenBatters.has(b.mlbamid)) {
        seenBatters.add(b.mlbamid);
        allBatters.push(b);
      }
    }
    console.log(`  ${pos}: ${data.length} (unique total: ${allBatters.length})`);
  }
  console.log(`Got ${allBatters.length} unique batting projections`);

  let battingUpdated = 0;
  for (const b of allBatters) {
    const playerId = mlbIdMap.get(b.mlbamid);
    if (!playerId) continue;

    const tb = Math.round((b.H || 0) + (b["2B"] || 0) + (b["3B"] || 0) * 2 + (b.HR || 0) * 3);

    await db.update(players).set({
      projR: Math.round(b.R || 0),
      projHR: Math.round(b.HR || 0),
      projRBI: Math.round(b.RBI || 0),
      projSB: Math.round(b.SB || 0),
      projAVG: (b.AVG || 0).toFixed(3),
      projH: Math.round(b.H || 0),
      proj2B: Math.round(b["2B"] || 0),
      proj3B: Math.round(b["3B"] || 0),
      projBB: Math.round(b.BB || 0),
      projK: Math.round(b.K || 0),
      projOBP: (b.OBP || 0).toFixed(3),
      projSLG: (b.SLG || 0).toFixed(3),
      projOPS: ((b.OBP || 0) + (b.SLG || 0)).toFixed(3),
      projTB: tb,
      projCS: Math.round(b.CS || 0),
      projHBP: Math.round(b.HBP || 0),
      projAB: Math.round(b.AB || 0),
      projPA: Math.round(b.PA || 0),
    }).where(eq(players.id, playerId));
    battingUpdated++;
  }
  console.log(`Updated ${battingUpdated} batters with projections`);

  console.log("\nFetching Steamer pitching projections by position...");
  const seenPitchers = new Set<number>();
  const allPitchers: any[] = [];
  for (const pos of PITCHING_POSITIONS) {
    const data: any[] = await fetchJson(`${STEAMER_PITCHING_URL}?pos=${pos}`);
    for (const p of data) {
      if (!seenPitchers.has(p.mlbamid)) {
        seenPitchers.add(p.mlbamid);
        allPitchers.push(p);
      }
    }
    console.log(`  ${pos}: ${data.length} (unique total: ${allPitchers.length})`);
  }
  console.log(`Got ${allPitchers.length} unique pitching projections`);

  let pitchingUpdated = 0;
  for (const p of allPitchers) {
    const playerId = mlbIdMap.get(p.mlbamid);
    if (!playerId) continue;

    await db.update(players).set({
      projW: Math.round(p.W || 0),
      projL: Math.round(p.L || 0),
      projSV: Math.round(p.SV || 0),
      projHLD: Math.round(p.HLD || 0),
      projERA: (p.ERA || 0).toFixed(2),
      projWHIP: (p.WHIP || 0).toFixed(2),
      projSO: Math.round(p.K || 0),
      projIP: (p.IP || 0).toFixed(1),
      projQS: Math.round(p.QS || 0),
      projCG: Math.round(p.CG || 0),
      projSHO: Math.round(p.ShO || 0),
      projBSV: 0,
    }).where(eq(players.id, playerId));
    pitchingUpdated++;
  }
  console.log(`Updated ${pitchingUpdated} pitchers with projections`);

  console.log(`\nDone! Total: ${battingUpdated} batters + ${pitchingUpdated} pitchers`);
  process.exit(0);
}

importProjections().catch(err => { console.error(err); process.exit(1); });
