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
    "TWP": "UT",
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
    "IF": "UT",
  };
  return posMap[posAbbr] || posAbbr;
}

async function classifyPitcher(mlbId: number): Promise<"SP" | "RP"> {
  try {
    const url = `${MLB_API}/people/${mlbId}/stats?stats=career&group=pitching`;
    const res = await fetch(url);
    if (!res.ok) return "SP";
    const data = await res.json();
    for (const statGroup of data.stats || []) {
      if (statGroup.group?.displayName === "pitching" && statGroup.splits?.length > 0) {
        const stat = statGroup.splits[0].stat;
        const games = stat.gamesPlayed || 0;
        const gamesStarted = stat.gamesStarted || 0;
        if (games > 0 && gamesStarted / games < 0.5) return "RP";
      }
    }
    return "SP";
  } catch {
    return "SP";
  }
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

  console.log("\nClassifying pitchers as SP or RP...");
  const pitcherClassifications = new Map<number, "SP" | "RP">();
  const pitcherEntries = allPlayerEntries.filter(e => {
    const detail = detailsMap.get(e.mlbId);
    const pos = detail?.primaryPosition?.abbreviation
      ? mapPosition(detail.primaryPosition.abbreviation)
      : e.position;
    return pos === "SP";
  });

  console.log(`  ${pitcherEntries.length} pitchers to classify`);
  const CLASSIFY_BATCH = 30;
  for (let i = 0; i < pitcherEntries.length; i += CLASSIFY_BATCH) {
    const batch = pitcherEntries.slice(i, i + CLASSIFY_BATCH);
    const results = await Promise.all(
      batch.map(async (entry) => {
        await new Promise(r => setTimeout(r, Math.random() * 200));
        const role = await classifyPitcher(entry.mlbId);
        return { mlbId: entry.mlbId, role };
      })
    );
    for (const { mlbId, role } of results) {
      pitcherClassifications.set(mlbId, role);
    }
    console.log(`  Classified ${Math.min(i + CLASSIFY_BATCH, pitcherEntries.length)} of ${pitcherEntries.length}`);
    if (i + CLASSIFY_BATCH < pitcherEntries.length) {
      await new Promise(r => setTimeout(r, 300));
    }
  }

  const rpCount = [...pitcherClassifications.values()].filter(r => r === "RP").length;
  console.log(`  Result: ${pitcherClassifications.size - rpCount} SP, ${rpCount} RP`);

  console.log("\nClearing existing players...");
  await db.delete(players);

  console.log("Inserting players into database...");
  const INSERT_BATCH = 200;

  for (let i = 0; i < allPlayerEntries.length; i += INSERT_BATCH) {
    const batch = allPlayerEntries.slice(i, i + INSERT_BATCH);
    const rows = batch.map(entry => {
      const detail = detailsMap.get(entry.mlbId);
      let position = detail?.primaryPosition?.abbreviation
        ? mapPosition(detail.primaryPosition.abbreviation)
        : entry.position;
      if (position === "SP" && pitcherClassifications.has(entry.mlbId)) {
        position = pitcherClassifications.get(entry.mlbId)!;
      }
      return {
        mlbId: entry.mlbId,
        name: entry.name,
        firstName: detail?.firstName || entry.name.split(" ")[0],
        lastName: detail?.lastName || entry.name.split(" ").slice(1).join(" "),
        position,
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
