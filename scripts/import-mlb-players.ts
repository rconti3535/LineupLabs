import { db } from "../server/db";
import { players } from "../shared/schema";
import { eq } from "drizzle-orm";

const MLB_API = "https://statsapi.mlb.com/api/v1";

const SPORT_LEVELS: Record<number, string> = {
  1: "MLB",
  11: "AAA",
  12: "AA",
  13: "A+",
  14: "A",
  16: "Rookie",
};

interface MlbTeam {
  id: number;
  name: string;
  abbreviation: string;
  sport: { id: number; name: string };
}

interface MlbRosterEntry {
  person: { id: number; fullName: string; link: string };
  jerseyNumber?: string;
  position: { abbreviation: string; name: string };
  status: { description: string };
}

interface MlbPersonDetail {
  id: number;
  fullName: string;
  firstName: string;
  lastName: string;
  currentAge?: number;
  height?: string;
  weight?: number;
  batSide?: { code: string; description: string };
  pitchHand?: { code: string; description: string };
  primaryPosition?: { abbreviation: string };
}

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return res.json();
}

function mapPosition(posAbbr: string): string {
  const posMap: Record<string, string> = {
    "P": "SP",
    "TWP": "UTIL",
    "DH": "DH",
    "C": "C",
    "1B": "1B",
    "2B": "2B",
    "3B": "3B",
    "SS": "SS",
    "LF": "OF",
    "CF": "OF",
    "RF": "OF",
    "OF": "OF",
    "IF": "UTIL",
  };
  return posMap[posAbbr] || posAbbr;
}

async function fetchTeams(): Promise<MlbTeam[]> {
  const sportIds = Object.keys(SPORT_LEVELS).join(",");
  const data = await fetchJson(`${MLB_API}/teams?sportIds=${sportIds}&season=2025&activeStatus=Y`);
  return data.teams || [];
}

async function fetchRoster(teamId: number): Promise<MlbRosterEntry[]> {
  try {
    const data = await fetchJson(`${MLB_API}/teams/${teamId}/roster?rosterType=fullRoster&season=2025`);
    return data.roster || [];
  } catch {
    return [];
  }
}

async function fetchPlayerDetails(personIds: number[]): Promise<MlbPersonDetail[]> {
  if (personIds.length === 0) return [];
  const ids = personIds.join(",");
  try {
    const data = await fetchJson(`${MLB_API}/people?personIds=${ids}`);
    return data.people || [];
  } catch {
    return [];
  }
}

async function importPlayers() {
  console.log("Fetching MLB teams...");
  const teams = await fetchTeams();
  console.log(`Found ${teams.length} teams across all levels`);

  const allPlayerEntries: {
    mlbId: number;
    name: string;
    position: string;
    team: string;
    teamAbbreviation: string;
    jerseyNumber: string | null;
    mlbLevel: string;
  }[] = [];

  const seenPlayerIds = new Set<number>();

  for (const team of teams) {
    const level = SPORT_LEVELS[team.sport.id] || "Other";
    console.log(`Fetching roster for ${team.name} (${level})...`);

    const roster = await fetchRoster(team.id);

    for (const entry of roster) {
      const mlbId = entry.person.id;
      if (seenPlayerIds.has(mlbId)) continue;
      seenPlayerIds.add(mlbId);

      allPlayerEntries.push({
        mlbId,
        name: entry.person.fullName,
        position: mapPosition(entry.position.abbreviation),
        team: team.name,
        teamAbbreviation: team.abbreviation,
        jerseyNumber: entry.jerseyNumber || null,
        mlbLevel: level,
      });
    }

    await new Promise(r => setTimeout(r, 50));
  }

  console.log(`\nTotal unique players collected: ${allPlayerEntries.length}`);
  console.log("Fetching player details in batches...");

  const BATCH_SIZE = 100;
  const detailsMap = new Map<number, MlbPersonDetail>();

  for (let i = 0; i < allPlayerEntries.length; i += BATCH_SIZE) {
    const batch = allPlayerEntries.slice(i, i + BATCH_SIZE);
    const ids = batch.map(p => p.mlbId);
    const details = await fetchPlayerDetails(ids);
    for (const d of details) {
      detailsMap.set(d.id, d);
    }
    console.log(`  Fetched details ${i + 1}-${Math.min(i + BATCH_SIZE, allPlayerEntries.length)} of ${allPlayerEntries.length}`);
    await new Promise(r => setTimeout(r, 100));
  }

  console.log("\nClearing existing players...");
  await db.delete(players);

  console.log("Inserting players into database...");
  const INSERT_BATCH = 200;

  for (let i = 0; i < allPlayerEntries.length; i += INSERT_BATCH) {
    const batch = allPlayerEntries.slice(i, i + INSERT_BATCH);
    const rows = batch.map(entry => {
      const detail = detailsMap.get(entry.mlbId);
      return {
        mlbId: entry.mlbId,
        name: entry.name,
        firstName: detail?.firstName || entry.name.split(" ")[0],
        lastName: detail?.lastName || entry.name.split(" ").slice(1).join(" "),
        position: detail?.primaryPosition?.abbreviation
          ? mapPosition(detail.primaryPosition.abbreviation)
          : entry.position,
        team: entry.team,
        teamAbbreviation: entry.teamAbbreviation,
        jerseyNumber: entry.jerseyNumber,
        bats: detail?.batSide?.code || null,
        throws: detail?.pitchHand?.code || null,
        age: detail?.currentAge || null,
        height: detail?.height || null,
        weight: detail?.weight || null,
        mlbLevel: entry.mlbLevel,
      };
    });

    await db.insert(players).values(rows);
    console.log(`  Inserted ${Math.min(i + INSERT_BATCH, allPlayerEntries.length)} of ${allPlayerEntries.length}`);
  }

  console.log(`\nDone! Imported ${allPlayerEntries.length} players.`);

  const counts = {
    MLB: 0, AAA: 0, AA: 0, "A+": 0, A: 0, Rookie: 0
  };
  for (const e of allPlayerEntries) {
    if (e.mlbLevel in counts) counts[e.mlbLevel as keyof typeof counts]++;
  }
  console.log("Breakdown by level:", counts);

  process.exit(0);
}

importPlayers().catch(err => {
  console.error("Import failed:", err);
  process.exit(1);
});
