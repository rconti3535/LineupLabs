import "dotenv/config";
import { db } from "../server/db";
import { botState, leagues } from "../shared/schema";
import { eq } from "drizzle-orm";

const MINOR_LEAGUE_CITIES = [
  "Durham", "Tacoma", "Nashville", "El Paso", "Lehigh Valley", "Salt Lake",
  "Oklahoma City", "Rochester", "Syracuse", "Columbus", "Indianapolis",
  "Louisville", "Memphis", "Reno", "Sacramento", "Albuquerque", "Buffalo",
  "Charlotte", "Gwinnett", "Iowa", "Jacksonville", "Norfolk", "Omaha",
  "Worcester", "Toledo", "Tucson", "Scranton", "Pawtucket", "New Orleans",
  "Portland", "Fresno", "Las Vegas", "Binghamton", "Trenton", "Akron",
  "Erie", "Harrisburg", "Birmingham", "Montgomery", "Pensacola", "Jackson",
  "Chattanooga", "Huntsville", "Corpus Christi", "Frisco", "Midland",
  "San Antonio", "Amarillo", "Tulsa", "Northwest Arkansas", "Springfield",
  "Quad Cities", "Peoria", "Kane County", "Beloit", "Wisconsin",
  "Cedar Rapids", "Dayton", "Fort Wayne", "Lake County", "Lansing",
  "South Bend", "West Michigan",
];

async function getLeagueCounter(): Promise<number> {
  const [row] = await db.select().from(botState).where(eq(botState.key, "league_counter"));
  return row?.value ?? 0;
}

async function setLeagueCounter(value: number): Promise<void> {
  await db
    .insert(botState)
    .values({ key: "league_counter", value })
    .onConflictDoUpdate({ target: botState.key, set: { value } });
}

async function main() {
  const startCounter = await getLeagueCounter();
  let counter = startCounter;

  const bestBallPositions = ["C", "INF", "INF", "INF", "INF", "OF", "OF", "OF", "SP", "SP", "SP", "RP", "RP"];

  for (let i = 0; i < 20; i++) {
    counter += 1;
    const city = MINOR_LEAGUE_CITIES[(counter - 1) % MINOR_LEAGUE_CITIES.length];
    const scoringFormat = Math.random() < 0.5 ? "Roto" : "Season Points";
    const maxTeams = Math.random() < 0.5 ? 10 : 12;
    const leagueName = `${city} ${counter} ${scoringFormat}`;
    const draftDate = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    await db.insert(leagues).values({
      name: leagueName,
      type: "Best Ball",
      numberOfTeams: maxTeams,
      maxTeams,
      scoringFormat,
      isPublic: true,
      draftType: "Snake",
      draftDate,
      draftOrder: "Random",
      secondsPerPick: 30,
      rosterPositions: bestBallPositions,
      maxRosterSize: 35,
      status: "Open",
      draftStatus: "pending",
    });

    console.log(`[Seed] Created league: ${leagueName} (${maxTeams} teams)`);
  }

  await setLeagueCounter(counter);
  console.log(`[Seed] Done. Counter moved from ${startCounter} -> ${counter}.`);
}

main().catch((err) => {
  console.error("[Seed] Failed:", err);
  process.exit(1);
});
