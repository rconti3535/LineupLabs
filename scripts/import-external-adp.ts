import { db } from "../server/db";
import { players } from "../shared/schema";
import { eq, isNotNull } from "drizzle-orm";

const STEAMER_BATTING_URL = "https://www.fangraphs.com/api/steamer/batting";
const STEAMER_PITCHING_URL = "https://www.fangraphs.com/api/steamer/pitching";

async function fetchJson(url: string) {
  const res = await fetch(url, {
    headers: { "User-Agent": "FantasyBaseballApp/1.0" },
  });
  if (!res.ok) throw new Error(`Failed: ${url} (${res.status})`);
  return res.json();
}

async function importAdp() {
  console.log("Building ADP rankings from Steamer WAR projections...");

  const allPlayers = await db.select({ id: players.id, mlbId: players.mlbId })
    .from(players)
    .where(isNotNull(players.mlbId));

  const mlbIdMap = new Map<number, number>();
  allPlayers.forEach(p => { if (p.mlbId) mlbIdMap.set(p.mlbId, p.id); });

  console.log("Fetching Steamer batting projections...");
  const batters: any[] = await fetchJson(STEAMER_BATTING_URL);
  console.log(`Got ${batters.length} batters`);

  console.log("Fetching Steamer pitching projections...");
  const pitchers: any[] = await fetchJson(STEAMER_PITCHING_URL);
  console.log(`Got ${pitchers.length} pitchers`);

  interface RankedPlayer {
    dbId: number;
    war: number;
    type: "batter" | "pitcher";
  }

  const ranked: RankedPlayer[] = [];

  for (const b of batters) {
    const dbId = mlbIdMap.get(b.mlbamid);
    if (!dbId) continue;
    ranked.push({ dbId, war: b.WAR || b.fWAR || 0, type: "batter" });
  }

  for (const p of pitchers) {
    const dbId = mlbIdMap.get(p.mlbamid);
    if (!dbId) continue;
    if (ranked.find(r => r.dbId === dbId)) continue;
    ranked.push({ dbId, war: p.WAR || p.fWAR || 0, type: "pitcher" });
  }

  ranked.sort((a, b) => b.war - a.war);

  console.log(`\nTop 20 by projected WAR:`);
  for (let i = 0; i < Math.min(20, ranked.length); i++) {
    const p = ranked[i];
    console.log(`  ${i + 1}. DB ID ${p.dbId} — WAR ${p.war.toFixed(1)} (${p.type})`);
  }

  console.log(`\nAssigning ADP ranks to ${ranked.length} players...`);
  let updated = 0;
  for (let i = 0; i < ranked.length; i++) {
    const adpRank = i + 1;
    await db.update(players).set({ externalAdp: adpRank }).where(eq(players.id, ranked[i].dbId));
    updated++;
    if (updated % 500 === 0) console.log(`  Progress: ${updated}/${ranked.length}`);
  }

  console.log(`\nDone! Assigned ADP to ${updated} players based on Steamer WAR rankings`);
  process.exit(0);
}

importAdp().catch(err => { console.error(err); process.exit(1); });
