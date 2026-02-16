const MLB_SCHEDULE_URL = "https://statsapi.mlb.com/api/v1/schedule";

const TEAM_ABBREV_MAP: Record<string, string> = {
  "OAK": "ATH",
  "ARI": "AZ",
};

interface GameInfo {
  gameDate: string;
  awayTeam: string;
  homeTeam: string;
  status: string;
  venue: string;
}

const scheduleCache = new Map<string, { fetchedAt: number; games: Map<string, GameInfo> }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

function toDbAbbrev(mlbAbbrev: string): string {
  return TEAM_ABBREV_MAP[mlbAbbrev] || mlbAbbrev;
}

export async function getScheduleForDate(date: string): Promise<Map<string, GameInfo>> {
  const cached = scheduleCache.get(date);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.games;
  }

  try {
    const url = `${MLB_SCHEDULE_URL}?date=${date}&sportId=1&hydrate=team`;
    const resp = await fetch(url);
    if (!resp.ok) {
      console.error(`MLB schedule API error: ${resp.status}`);
      return new Map();
    }
    const data = await resp.json() as any;

    const gameMap = new Map<string, GameInfo>();

    for (const d of data.dates || []) {
      for (const g of d.games || []) {
        const awayMlb = g.teams?.away?.team?.abbreviation;
        const homeMlb = g.teams?.home?.team?.abbreviation;
        if (!awayMlb || !homeMlb) continue;

        const awayDb = toDbAbbrev(awayMlb);
        const homeDb = toDbAbbrev(homeMlb);

        const info: GameInfo = {
          gameDate: g.gameDate,
          awayTeam: awayDb,
          homeTeam: homeDb,
          status: g.status?.detailedState || "Scheduled",
          venue: g.venue?.name || "",
        };

        gameMap.set(awayDb, info);
        gameMap.set(homeDb, info);
      }
    }

    scheduleCache.set(date, { fetchedAt: Date.now(), games: gameMap });
    return gameMap;
  } catch (err) {
    console.error("Failed to fetch MLB schedule:", err);
    return new Map();
  }
}

export interface PlayerGameTime {
  playerId: number;
  gameTime: string | null;
  opponent: string | null;
  isHome: boolean;
  status: string | null;
  isLocked: boolean;
}

export async function getPlayerGameTimes(
  players: { id: number; teamAbbreviation: string | null }[],
  date: string
): Promise<PlayerGameTime[]> {
  const schedule = await getScheduleForDate(date);

  return players.map(player => {
    const abbr = player.teamAbbreviation;
    if (!abbr) {
      return { playerId: player.id, gameTime: null, opponent: null, isHome: false, status: null, isLocked: false };
    }

    const game = schedule.get(abbr);
    if (!game) {
      return { playerId: player.id, gameTime: null, opponent: null, isHome: false, status: null, isLocked: false };
    }

    const isHome = game.homeTeam === abbr;
    const opponent = isHome ? game.awayTeam : game.homeTeam;

    const gameStart = new Date(game.gameDate);
    const now = new Date();
    const isLocked = now >= gameStart;

    return {
      playerId: player.id,
      gameTime: game.gameDate,
      opponent,
      isHome,
      status: game.status,
      isLocked,
    };
  });
}
