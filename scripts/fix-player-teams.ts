/**
 * Fixes existing players in the database:
 * 1. Maps minor league team names to their MLB parent organization
 * 2. Sets all players' mlbLevel to "MLB"
 *
 * Run: npx tsx scripts/fix-player-teams.ts
 */
import "dotenv/config";
import dns from "dns";
dns.setDefaultResultOrder("ipv4first");

import { db } from "../server/db";
import { players } from "../shared/schema";
import { eq, sql } from "drizzle-orm";

const MLB_API = "https://statsapi.mlb.com/api/v1";

interface MlbTeam {
  id: number;
  name: string;
  abbreviation: string;
  sport: { id: number };
  parentOrgId?: number;
}

async function fixPlayerTeams() {
  console.log("Fetching MLB team data to build parent org mapping...");
  const res = await fetch(`${MLB_API}/teams?sportIds=1,11,12,13,14,16&season=2025&activeStatus=Y`);
  if (!res.ok) throw new Error(`Failed to fetch teams: ${res.status}`);
  const data = await res.json();
  const teams: MlbTeam[] = data.teams || [];

  const mlbTeamMap = new Map<number, { name: string; abbreviation: string }>();
  for (const t of teams) {
    if (t.sport.id === 1) {
      mlbTeamMap.set(t.id, { name: t.name, abbreviation: t.abbreviation });
    }
  }

  const minorToParent = new Map<string, { name: string; abbreviation: string }>();
  for (const t of teams) {
    if (t.sport.id !== 1 && t.parentOrgId && mlbTeamMap.has(t.parentOrgId)) {
      minorToParent.set(t.name, mlbTeamMap.get(t.parentOrgId)!);
      minorToParent.set(t.abbreviation, mlbTeamMap.get(t.parentOrgId)!);
    }
  }

  console.log(`Found ${mlbTeamMap.size} MLB teams, ${minorToParent.size / 2} minor league teams mapped.`);

  const allPlayers = await db.select({
    id: players.id,
    team: players.team,
    teamAbbreviation: players.teamAbbreviation,
    mlbLevel: players.mlbLevel,
  }).from(players);

  let updatedTeams = 0;
  let updatedLevel = 0;

  for (const p of allPlayers) {
    const updates: Record<string, unknown> = {};

    if (p.mlbLevel !== "MLB") {
      updates.mlbLevel = "MLB";
      updatedLevel++;
    }

    const parentByName = minorToParent.get(p.team);
    if (parentByName) {
      updates.team = parentByName.name;
      updates.teamAbbreviation = parentByName.abbreviation;
      updatedTeams++;
    } else if (p.teamAbbreviation && minorToParent.has(p.teamAbbreviation)) {
      const parent = minorToParent.get(p.teamAbbreviation)!;
      updates.team = parent.name;
      updates.teamAbbreviation = parent.abbreviation;
      updatedTeams++;
    }

    if (Object.keys(updates).length > 0) {
      await db.update(players).set(updates).where(eq(players.id, p.id));
    }
  }

  console.log(`Updated ${updatedTeams} players' team names to MLB parent org.`);
  console.log(`Updated ${updatedLevel} players' mlbLevel to "MLB".`);
  console.log("Done!");

  process.exit(0);
}

fixPlayerTeams().catch(err => {
  console.error("Fix failed:", err);
  process.exit(1);
});
