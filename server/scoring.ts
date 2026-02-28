import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "./db";
import {
  draftPicks,
  leagues,
  players,
  teams,
  type Player,
  type League,
  type Team,
  type DraftPick,
  weeklyBestBallPoints,
  weeklyBestBallRotoPoints,
  weeklyPlayerStatSnapshots,
} from "@shared/schema";
import { computeRotoStandings, type TeamStandings } from "./roto-scoring";
import { addDaysToYmd, getBestBallWeekContext, listCompletedWeekStarts, weekNumberFromAnchor } from "./bestball-week";

export interface PointsStandings {
  teamId: number;
  teamName: string;
  userId: number | null;
  isCpu: boolean | null;
  totalPoints: number;
  categoryValues: Record<string, number>;
}

export interface H2HRecord {
  teamId: number;
  teamName: string;
  userId: number | null;
  isCpu: boolean | null;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
  categoryValues: Record<string, number>;
}

export interface H2HCategoryRecord {
  teamId: number;
  teamName: string;
  userId: number | null;
  isCpu: boolean | null;
  categoryWins: number;
  categoryLosses: number;
  categoryTies: number;
  categoryValues: Record<string, number>;
}

const PITCHING_POSITIONS = ["SP", "RP"];
const INF_POSITIONS = ["1B", "2B", "3B", "SS"];
const OF_POSITIONS = ["OF", "LF", "CF", "RF"];

function isPitchingSlot(slotPos: string): boolean {
  return PITCHING_POSITIONS.includes(slotPos);
}

function isHittingGroupSlot(slotPos: string): boolean {
  return slotPos === "INF" || slotPos === "OF" || slotPos === "UT" || slotPos === "DH";
}

function isActiveSlot(slotPos: string): boolean {
  return slotPos !== "BN" && slotPos !== "IL";
}

function canFillSlot(slot: string, playerPos: string): boolean {
  if (slot === "C") return playerPos === "C";
  if (slot === "1B") return playerPos === "1B";
  if (slot === "2B") return playerPos === "2B";
  if (slot === "3B") return playerPos === "3B";
  if (slot === "SS") return playerPos === "SS";
  if (slot === "INF") return INF_POSITIONS.includes(playerPos) || playerPos === "INF";
  if (slot === "OF") return OF_POSITIONS.includes(playerPos) || playerPos === "DH" || playerPos === "UT";
  if (slot === "SP") return playerPos === "SP";
  if (slot === "RP") return playerPos === "RP";
  if (slot === "P") return PITCHING_POSITIONS.includes(playerPos);
  if (slot === "UT" || slot === "DH") return !PITCHING_POSITIONS.includes(playerPos);
  return false;
}

export const DEFAULT_POINT_VALUES: Record<string, number> = {
  R: 1, HR: 4, RBI: 1, SB: 2, H: 0.5, "2B": 1, "3B": 2, BB: 1, HBP: 1, TB: 0.5, CS: -1,
  W: 5, SV: 5, K: 1, QS: 3, HLD: 2, SO: 1, L: -2, CG: 3, SHO: 5, BSV: -2,
};

function getPointValues(league: League): Record<string, number> {
  if (league.pointValues) {
    try {
      const parsed = JSON.parse(league.pointValues);
      if (typeof parsed === "object" && parsed !== null) {
        return { ...DEFAULT_POINT_VALUES, ...parsed };
      }
    } catch {}
  }
  return DEFAULT_POINT_VALUES;
}

const HITTING_POINT_STATS = ["R", "HR", "RBI", "SB", "H", "2B", "3B", "BB", "HBP", "TB", "CS"];
const PITCHING_POINT_STATS = ["W", "SV", "K", "QS", "HLD", "SO", "L", "CG", "SHO", "BSV"];

const HITTING_STAT_MAP: Record<string, string> = {
  R: "statR", HR: "statHR", RBI: "statRBI", SB: "statSB", H: "statH",
  "2B": "stat2B", "3B": "stat3B", BB: "statBB", K: "statK", TB: "statTB",
  CS: "statCS", HBP: "statHBP",
};

const PITCHING_STAT_MAP: Record<string, string> = {
  W: "statW", SV: "statSV", K: "statSO", SO: "statSO", L: "statL",
  QS: "statQS", HLD: "statHLD", CG: "statCG", SHO: "statSHO", BSV: "statBSV",
};

const ALL_STAT_KEYS = ["statR", "statHR", "statRBI", "statSB", "statH", "stat2B", "stat3B",
  "statBB", "statK", "statTB", "statCS", "statHBP", "statAB", "statPA",
  "statW", "statSV", "statSO", "statL", "statQS", "statHLD", "statCG", "statSHO", "statBSV",
  "statIPOuts", "statER", "statBBp", "statHA"];

const STAT_TO_S26_PLAYER_FIELD: Record<string, keyof Player> = {
  statR: "s26R",
  statHR: "s26HR",
  statRBI: "s26RBI",
  statSB: "s26SB",
  statH: "s26H",
  stat2B: "s262B",
  stat3B: "s263B",
  statBB: "s26BB",
  statK: "s26K",
  statTB: "s26TB",
  statCS: "s26CS",
  statHBP: "s26HBP",
  statAB: "s26AB",
  statPA: "s26PA",
  statW: "s26W",
  statSV: "s26SV",
  statSO: "s26SO",
  statL: "s26L",
  statQS: "s26QS",
  statHLD: "s26HLD",
  statCG: "s26CG",
  statSHO: "s26SHO",
  statBSV: "s26BSV",
  statIPOuts: "s26IPOuts",
  statER: "s26ER",
  statBBp: "s26BBp",
  statHA: "s26HA",
};

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = parseFloat(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

function toNumberRecord(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object") return {};
  const out: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    out[key] = toNumber(raw);
  }
  return out;
}

function extractS26CumulativeStats(player: Player): Record<string, number> {
  const cumulative: Record<string, number> = {};
  for (const statKey of ALL_STAT_KEYS) {
    const s26Field = STAT_TO_S26_PLAYER_FIELD[statKey];
    cumulative[statKey] = toNumber((player as Record<string, unknown>)[s26Field as string]);
  }
  return cumulative;
}

function shouldUseWeeklyRotoBestBallSnapshots(league: League): boolean {
  return league.scoringFormat === "Roto" && league.type === "Best Ball";
}

function computePlayerFantasyPoints(
  player: Player,
  pointValues: Record<string, number>,
  hittingCats: string[],
  pitchingCats: string[],
): number {
  let pts = 0;
  const isPitcher = PITCHING_POSITIONS.includes(player.position);

  if (!isPitcher) {
    for (const cat of hittingCats) {
      const statKey = HITTING_STAT_MAP[cat];
      if (!statKey) continue;
      const remapped = statKey.replace(/^stat/, "s26");
      const val = (player as Record<string, unknown>)[remapped];
      let numVal = 0;
      if (typeof val === "number") numVal = val;
      else if (typeof val === "string") { const n = parseFloat(val); if (!isNaN(n)) numVal = n; }
      pts += (pointValues[cat] || 0) * numVal;
    }
  } else {
    for (const cat of pitchingCats) {
      const statKey = PITCHING_STAT_MAP[cat];
      if (!statKey) continue;
      const remapped = statKey.replace(/^stat/, "s26");
      const val = (player as Record<string, unknown>)[remapped];
      let numVal = 0;
      if (typeof val === "number") numVal = val;
      else if (typeof val === "string") { const n = parseFloat(val); if (!isNaN(n)) numVal = n; }
      pts += (pointValues[cat] || 0) * numVal;
    }
  }

  return pts;
}

function selectBestBallOptimalLineupForPoints(
  teamPlayers: Player[],
  rosterPositions: string[],
  pointValues: Record<string, number>,
  hittingCats: string[],
  pitchingCats: string[],
): Player[] {
  const activeSlots = rosterPositions.filter(s => isActiveSlot(s));

  const scored = teamPlayers.map(p => ({
    player: p,
    points: computePlayerFantasyPoints(p, pointValues, hittingCats, pitchingCats),
  }));

  scored.sort((a, b) => b.points - a.points);

  const selected: Player[] = [];
  const usedPlayerIds = new Set<number>();
  const slotsFilled = new Array(activeSlots.length).fill(false);

  for (const { player } of scored) {
    if (usedPlayerIds.has(player.id)) continue;
    for (let i = 0; i < activeSlots.length; i++) {
      if (slotsFilled[i]) continue;
      if (canFillSlot(activeSlots[i], player.position)) {
        selected.push(player);
        usedPlayerIds.add(player.id);
        slotsFilled[i] = true;
        break;
      }
    }
    if (selected.length >= activeSlots.length) break;
  }

  return selected;
}

function computeTeamFantasyPoints(
  league: League,
  teamPicks: DraftPick[],
  allPlayers: Map<number, Player>,
  rosterPositions: string[],
): { total: number; categoryValues: Record<string, number> } {
  const isPointsFormat = league.scoringFormat === "H2H Points" || league.scoringFormat === "Season Points";
  const hittingCats = isPointsFormat ? HITTING_POINT_STATS : (league.hittingCategories || ["R", "HR", "RBI", "SB", "AVG"]);
  const pitchingCats = isPointsFormat ? PITCHING_POINT_STATS : (league.pitchingCategories || ["W", "SV", "K", "ERA", "WHIP"]);
  const pointValues = getPointValues(league);
  const isBestBall = league.type === "Best Ball";

  const categoryValues: Record<string, number> = {};
  let total = 0;
  const hittingAccum: Record<string, number> = {};
  const pitchingAccum: Record<string, number> = {};

  if (isBestBall) {
    const teamPlayers = teamPicks.map(p => allPlayers.get(p.playerId)).filter(Boolean) as Player[];
    const optimalPlayers = selectBestBallOptimalLineupForPoints(teamPlayers, rosterPositions, pointValues, hittingCats, pitchingCats);

    for (const player of optimalPlayers) {
      const isPitcher = PITCHING_POSITIONS.includes(player.position);
      const accum = isPitcher ? pitchingAccum : hittingAccum;
      for (const key of ALL_STAT_KEYS) {
        const remapped = key.replace(/^stat/, "s26");
        const val = (player as Record<string, unknown>)[remapped];
        if (typeof val === "number") accum[key] = (accum[key] || 0) + val;
        else if (typeof val === "string") { const num = parseFloat(val); if (!isNaN(num)) accum[key] = (accum[key] || 0) + num; }
      }
    }
  } else {
    for (const pick of teamPicks) {
      const slotIdx = pick.rosterSlot;
      let slotPos = "BN";
      if (slotIdx !== null && slotIdx !== undefined && slotIdx < rosterPositions.length) {
        slotPos = rosterPositions[slotIdx];
      }
      if (!isActiveSlot(slotPos)) continue;
      const player = allPlayers.get(pick.playerId);
      if (!player) continue;
      const isPitcher = isPitchingSlot(slotPos);
      const accum = isPitcher ? pitchingAccum : hittingAccum;
      for (const key of ALL_STAT_KEYS) {
        const remapped = key.replace(/^stat/, "s26");
        const val = (player as Record<string, unknown>)[remapped];
        if (typeof val === "number") accum[key] = (accum[key] || 0) + val;
        else if (typeof val === "string") { const num = parseFloat(val); if (!isNaN(num)) accum[key] = (accum[key] || 0) + num; }
      }
    }
  }

  for (const cat of hittingCats) {
    const key = HITTING_STAT_MAP[cat];
    const val = key ? (hittingAccum[key] || 0) : 0;
    categoryValues[`h_${cat}`] = val;
    total += (pointValues[cat] || 0) * val;
  }

  for (const cat of pitchingCats) {
    const key = PITCHING_STAT_MAP[cat];
    const val = key ? (pitchingAccum[key] || 0) : 0;
    categoryValues[`p_${cat}`] = val;
    total += (pointValues[cat] || 0) * val;
  }

  return { total, categoryValues };
}

function shouldUseWeeklyBestBallSnapshots(league: League): boolean {
  return league.scoringFormat === "Season Points" && league.type === "Best Ball";
}

function sumTeamSeasonPointCategories(
  league: League,
  teamPicks: DraftPick[],
  allPlayers: Map<number, Player>,
  rosterPositions: string[],
): { total: number; categoryValues: Record<string, number> } {
  return computeTeamFantasyPoints(league, teamPicks, allPlayers, rosterPositions);
}

async function computeSeasonPointsBestBallStandingsFromWeeklySnapshots(
  league: League,
  teams: Team[],
  draftPicks: DraftPick[],
  allPlayers: Map<number, Player>,
  rosterPositions: string[],
): Promise<PointsStandings[]> {
  const ctx = getBestBallWeekContext(league, new Date());
  const snapshots = await db
    .select()
    .from(weeklyBestBallPoints)
    .where(eq(weeklyBestBallPoints.leagueId, league.id))
    .orderBy(asc(weeklyBestBallPoints.weekStart));

  const byTeam = new Map<number, typeof snapshots>();
  for (const row of snapshots) {
    const arr = byTeam.get(row.teamId) ?? [];
    arr.push(row);
    byTeam.set(row.teamId, arr);
  }

  const results: PointsStandings[] = teams.map((team) => {
    const teamPicks = draftPicks.filter((dp) => dp.teamId === team.id);
    const currentTotals = sumTeamSeasonPointCategories(league, teamPicks, allPlayers, rosterPositions);
    const teamSnapshots = byTeam.get(team.id) ?? [];

    let finalizedTotal = 0;
    let priorFinalizedCumulative = 0;
    for (const snap of teamSnapshots) {
      if (snap.weekStart < ctx.currentWeekStart) {
        finalizedTotal += Number(snap.weeklyPoints || 0);
        priorFinalizedCumulative = Math.max(priorFinalizedCumulative, Number(snap.cumulativePoints || 0));
      }
    }

    const currentWeekLive = Math.max(0, currentTotals.total - priorFinalizedCumulative);
    const totalPoints = finalizedTotal + currentWeekLive;

    return {
      teamId: team.id,
      teamName: team.name,
      userId: team.userId,
      isCpu: team.isCpu,
      totalPoints,
      categoryValues: currentTotals.categoryValues,
    };
  });

  results.sort((a, b) => b.totalPoints - a.totalPoints);
  return results;
}

export async function computeSeasonPointsStandings(
  league: League,
  teams: Team[],
  draftPicks: DraftPick[],
  allPlayers: Map<number, Player>,
  rosterPositions: string[],
): Promise<PointsStandings[]> {
  if (shouldUseWeeklyBestBallSnapshots(league)) {
    return computeSeasonPointsBestBallStandingsFromWeeklySnapshots(
      league,
      teams,
      draftPicks,
      allPlayers,
      rosterPositions,
    );
  }

  const results: PointsStandings[] = teams.map(team => {
    const teamPicks = draftPicks.filter(dp => dp.teamId === team.id);
    const { total, categoryValues } = computeTeamFantasyPoints(league, teamPicks, allPlayers, rosterPositions);
    return {
      teamId: team.id,
      teamName: team.name,
      userId: team.userId,
      isCpu: team.isCpu,
      totalPoints: total,
      categoryValues,
    };
  });

  results.sort((a, b) => b.totalPoints - a.totalPoints);
  return results;
}

function generateRoundRobinMatchups(teamIds: number[]): number[][][] {
  const n = teamIds.length;
  const ids = [...teamIds];
  if (n % 2 !== 0) ids.push(-1);
  const numTeams = ids.length;
  const weeks: number[][][] = [];

  for (let round = 0; round < numTeams - 1; round++) {
    const matchups: number[][] = [];
    for (let i = 0; i < numTeams / 2; i++) {
      const home = ids[i];
      const away = ids[numTeams - 1 - i];
      if (home !== -1 && away !== -1) {
        matchups.push([home, away]);
      }
    }
    weeks.push(matchups);
    const last = ids.pop()!;
    ids.splice(1, 0, last);
  }
  return weeks;
}

export function computeH2HPointsStandings(
  league: League,
  teams: Team[],
  draftPicks: DraftPick[],
  allPlayers: Map<number, Player>,
  rosterPositions: string[],
): H2HRecord[] {
  const teamPoints = new Map<number, { total: number; categoryValues: Record<string, number> }>();
  for (const team of teams) {
    const teamPicks = draftPicks.filter(dp => dp.teamId === team.id);
    teamPoints.set(team.id, computeTeamFantasyPoints(league, teamPicks, allPlayers, rosterPositions));
  }

  const records = new Map<number, H2HRecord>();
  for (const team of teams) {
    records.set(team.id, {
      teamId: team.id,
      teamName: team.name,
      userId: team.userId,
      isCpu: team.isCpu,
      wins: 0, losses: 0, ties: 0,
      pointsFor: teamPoints.get(team.id)!.total,
      pointsAgainst: 0,
      categoryValues: teamPoints.get(team.id)!.categoryValues,
    });
  }

  const weeks = generateRoundRobinMatchups(teams.map(t => t.id));
  for (const week of weeks) {
    for (const [homeId, awayId] of week) {
      const homeP = teamPoints.get(homeId)!.total;
      const awayP = teamPoints.get(awayId)!.total;
      const homeRec = records.get(homeId)!;
      const awayRec = records.get(awayId)!;

      homeRec.pointsAgainst += awayP;
      awayRec.pointsAgainst += homeP;

      if (homeP > awayP) {
        homeRec.wins++;
        awayRec.losses++;
      } else if (awayP > homeP) {
        awayRec.wins++;
        homeRec.losses++;
      } else {
        homeRec.ties++;
        awayRec.ties++;
      }
    }
  }

  const results = Array.from(records.values());
  results.sort((a, b) => {
    const aWinPct = a.wins + a.losses + a.ties === 0 ? 0 : a.wins / (a.wins + a.losses + a.ties);
    const bWinPct = b.wins + b.losses + b.ties === 0 ? 0 : b.wins / (b.wins + b.losses + b.ties);
    if (bWinPct !== aWinPct) return bWinPct - aWinPct;
    return b.pointsFor - a.pointsFor;
  });
  return results;
}

export function computeH2HEachCategoryStandings(
  league: League,
  teams: Team[],
  draftPicks: DraftPick[],
  allPlayers: Map<number, Player>,
  rosterPositions: string[],
): H2HCategoryRecord[] {
  const rotoStandings = computeRotoStandings(league, teams, draftPicks, allPlayers, rosterPositions, "s26");
  const teamCatValues = new Map<number, Record<string, number>>();
  for (const s of rotoStandings) {
    teamCatValues.set(s.teamId, s.categoryValues);
  }

  const hittingCats = league.hittingCategories || ["R", "HR", "RBI", "SB", "AVG"];
  const pitchingCats = league.pitchingCategories || ["W", "SV", "K", "ERA", "WHIP"];
  const allCats = [
    ...hittingCats.map(c => ({ key: `h_${c}`, id: c, isHitting: true })),
    ...pitchingCats.map(c => ({ key: `p_${c}`, id: c, isHitting: false })),
  ];

  const LOWER_IS_BETTER = new Set(["ERA", "WHIP", "K", "CS", "L", "BSV", "BB"]);

  const records = new Map<number, H2HCategoryRecord>();
  for (const team of teams) {
    records.set(team.id, {
      teamId: team.id,
      teamName: team.name,
      userId: team.userId,
      isCpu: team.isCpu,
      categoryWins: 0, categoryLosses: 0, categoryTies: 0,
      categoryValues: teamCatValues.get(team.id) || {},
    });
  }

  const weeks = generateRoundRobinMatchups(teams.map(t => t.id));
  for (const week of weeks) {
    for (const [homeId, awayId] of week) {
      const homeVals = teamCatValues.get(homeId) || {};
      const awayVals = teamCatValues.get(awayId) || {};
      const homeRec = records.get(homeId)!;
      const awayRec = records.get(awayId)!;

      for (const cat of allCats) {
        const hv = homeVals[cat.key] || 0;
        const av = awayVals[cat.key] || 0;
        const lowerBetter = cat.isHitting
          ? LOWER_IS_BETTER.has(cat.id) && ["K", "CS"].includes(cat.id)
          : LOWER_IS_BETTER.has(cat.id);

        let homeWins: boolean;
        if (hv === av) {
          homeRec.categoryTies++;
          awayRec.categoryTies++;
          continue;
        }
        homeWins = lowerBetter ? hv < av : hv > av;
        if (homeWins) {
          homeRec.categoryWins++;
          awayRec.categoryLosses++;
        } else {
          awayRec.categoryWins++;
          homeRec.categoryLosses++;
        }
      }
    }
  }

  const results = Array.from(records.values());
  results.sort((a, b) => {
    const aTotal = a.categoryWins + a.categoryLosses + a.categoryTies;
    const bTotal = b.categoryWins + b.categoryLosses + b.categoryTies;
    const aWinPct = aTotal === 0 ? 0 : a.categoryWins / aTotal;
    const bWinPct = bTotal === 0 ? 0 : b.categoryWins / bTotal;
    return bWinPct - aWinPct;
  });
  return results;
}

export function computeH2HMostCategoriesStandings(
  league: League,
  teams: Team[],
  draftPicks: DraftPick[],
  allPlayers: Map<number, Player>,
  rosterPositions: string[],
): H2HRecord[] {
  const rotoStandings = computeRotoStandings(league, teams, draftPicks, allPlayers, rosterPositions, "s26");
  const teamCatValues = new Map<number, Record<string, number>>();
  for (const s of rotoStandings) {
    teamCatValues.set(s.teamId, s.categoryValues);
  }

  const hittingCats = league.hittingCategories || ["R", "HR", "RBI", "SB", "AVG"];
  const pitchingCats = league.pitchingCategories || ["W", "SV", "K", "ERA", "WHIP"];
  const allCats = [
    ...hittingCats.map(c => ({ key: `h_${c}`, id: c, isHitting: true })),
    ...pitchingCats.map(c => ({ key: `p_${c}`, id: c, isHitting: false })),
  ];

  const LOWER_IS_BETTER = new Set(["ERA", "WHIP", "K", "CS", "L", "BSV", "BB"]);

  const records = new Map<number, H2HRecord>();
  for (const team of teams) {
    records.set(team.id, {
      teamId: team.id,
      teamName: team.name,
      userId: team.userId,
      isCpu: team.isCpu,
      wins: 0, losses: 0, ties: 0,
      pointsFor: 0, pointsAgainst: 0,
      categoryValues: teamCatValues.get(team.id) || {},
    });
  }

  const weeks = generateRoundRobinMatchups(teams.map(t => t.id));
  for (const week of weeks) {
    for (const [homeId, awayId] of week) {
      const homeVals = teamCatValues.get(homeId) || {};
      const awayVals = teamCatValues.get(awayId) || {};
      const homeRec = records.get(homeId)!;
      const awayRec = records.get(awayId)!;

      let homeCatWins = 0;
      let awayCatWins = 0;

      for (const cat of allCats) {
        const hv = homeVals[cat.key] || 0;
        const av = awayVals[cat.key] || 0;
        const lowerBetter = cat.isHitting
          ? LOWER_IS_BETTER.has(cat.id) && ["K", "CS"].includes(cat.id)
          : LOWER_IS_BETTER.has(cat.id);

        if (hv === av) continue;
        const homeWins = lowerBetter ? hv < av : hv > av;
        if (homeWins) homeCatWins++;
        else awayCatWins++;
      }

      homeRec.pointsFor += homeCatWins;
      homeRec.pointsAgainst += awayCatWins;
      awayRec.pointsFor += awayCatWins;
      awayRec.pointsAgainst += homeCatWins;

      if (homeCatWins > awayCatWins) {
        homeRec.wins++;
        awayRec.losses++;
      } else if (awayCatWins > homeCatWins) {
        awayRec.wins++;
        homeRec.losses++;
      } else {
        homeRec.ties++;
        awayRec.ties++;
      }
    }
  }

  const results = Array.from(records.values());
  results.sort((a, b) => {
    const aTotal = a.wins + a.losses + a.ties;
    const bTotal = b.wins + b.losses + b.ties;
    const aWinPct = aTotal === 0 ? 0 : a.wins / aTotal;
    const bWinPct = bTotal === 0 ? 0 : b.wins / bTotal;
    if (bWinPct !== aWinPct) return bWinPct - aWinPct;
    return b.pointsFor - a.pointsFor;
  });
  return results;
}

export interface MatchupPair {
  home: {
    teamId: number;
    teamName: string;
    userId: number | null;
    score: number;
    categoryValues: Record<string, number>;
    roster: { slotPos: string; player: Player | null }[];
  };
  away: {
    teamId: number;
    teamName: string;
    userId: number | null;
    score: number;
    categoryValues: Record<string, number>;
    roster: { slotPos: string; player: Player | null }[];
  };
  categoryResults?: { cat: string; homeVal: number; awayVal: number; winner: "home" | "away" | "tie" }[];
}

export interface MatchupWeek {
  week: number;
  matchups: MatchupPair[];
}

export function computeMatchups(
  league: League,
  teams: Team[],
  draftPicks: DraftPick[],
  allPlayers: Map<number, Player>,
  rosterPositions: string[],
  persistedMatchups?: { week: number; teamAId: number; teamBId: number }[],
): MatchupWeek[] {
  const format = league.scoringFormat || "Roto";
  const isPoints = format === "H2H Points";

  const hittingCats = league.hittingCategories || ["R", "HR", "RBI", "SB", "AVG"];
  const pitchingCats = league.pitchingCategories || ["W", "SV", "K", "ERA", "WHIP"];
  const allCats = [
    ...hittingCats.map(c => ({ key: `h_${c}`, id: c, isHitting: true })),
    ...pitchingCats.map(c => ({ key: `p_${c}`, id: c, isHitting: false })),
  ];
  const LOWER_IS_BETTER = new Set(["ERA", "WHIP", "K", "CS", "L", "BSV", "BB"]);

  const teamData = new Map<number, { 
    total: number; 
    categoryValues: Record<string, number>; 
    teamName: string; 
    userId: number | null;
    roster: { slotPos: string; player: Player | null }[];
  }>();

  for (const team of teams) {
    const teamPicks = draftPicks.filter(dp => dp.teamId === team.id);
    const roster: { slotPos: string; player: Player | null }[] = rosterPositions.map(pos => ({ slotPos: pos, player: null }));
    
    for (const pick of teamPicks) {
      if (pick.rosterSlot !== null && pick.rosterSlot !== undefined && pick.rosterSlot < roster.length) {
        roster[pick.rosterSlot].player = allPlayers.get(pick.playerId) || null;
      }
    }

    if (isPoints) {
      const result = computeTeamFantasyPoints(league, teamPicks, allPlayers, rosterPositions);
      teamData.set(team.id, { 
        total: result.total, 
        categoryValues: result.categoryValues, 
        teamName: team.name, 
        userId: team.userId,
        roster
      });
    } else {
      const results = computeTeamFantasyPoints(league, teamPicks, allPlayers, rosterPositions);
      teamData.set(team.id, { 
        total: 0, 
        categoryValues: results.categoryValues, 
        teamName: team.name, 
        userId: team.userId,
        roster
      });
    }
  }

  let weeks: [number, number][][];
  if (persistedMatchups && persistedMatchups.length > 0) {
    const weekMap = new Map<number, [number, number][]>();
    for (const m of persistedMatchups) {
      if (!weekMap.has(m.week)) weekMap.set(m.week, []);
      weekMap.get(m.week)!.push([m.teamAId, m.teamBId]);
    }
    const sortedWeeks = Array.from(weekMap.keys()).sort((a, b) => a - b);
    weeks = sortedWeeks.map(w => weekMap.get(w)!);
  } else {
    weeks = generateRoundRobinMatchups(teams.map(t => t.id)) as [number, number][][];
  }
  const result: MatchupWeek[] = [];

  for (let wi = 0; wi < weeks.length; wi++) {
    const matchups: MatchupPair[] = [];
    for (const [homeId, awayId] of weeks[wi]) {
      const homeInfo = teamData.get(homeId);
      const awayInfo = teamData.get(awayId);
      if (!homeInfo || !awayInfo) continue;

      let homeScore = 0;
      let awayScore = 0;
      let categoryResults: MatchupPair["categoryResults"] = undefined;

      if (isPoints) {
        homeScore = homeInfo.total;
        awayScore = awayInfo.total;
      } else {
        categoryResults = [];
        for (const cat of allCats) {
          const hv = homeInfo.categoryValues[cat.key] || 0;
          const av = awayInfo.categoryValues[cat.key] || 0;
          const lowerBetter = cat.isHitting
            ? LOWER_IS_BETTER.has(cat.id) && ["K", "CS"].includes(cat.id)
            : LOWER_IS_BETTER.has(cat.id);

          let winner: "home" | "away" | "tie" = "tie";
          if (hv !== av) {
            winner = lowerBetter ? (hv < av ? "home" : "away") : (hv > av ? "home" : "away");
          }
          if (winner === "home") homeScore++;
          else if (winner === "away") awayScore++;

          categoryResults.push({ cat: cat.id, homeVal: hv, awayVal: av, winner });
        }
      }

      matchups.push({
        home: { 
          teamId: homeId, 
          teamName: homeInfo.teamName, 
          userId: homeInfo.userId, 
          score: homeScore, 
          categoryValues: homeInfo.categoryValues,
          roster: homeInfo.roster
        },
        away: { 
          teamId: awayId, 
          teamName: awayInfo.teamName, 
          userId: awayInfo.userId, 
          score: awayScore, 
          categoryValues: awayInfo.categoryValues,
          roster: awayInfo.roster
        },
        categoryResults,
      });
    }
    result.push({ week: wi + 1, matchups });
  }

  return result;
}

function getDefaultRosterPositions(league: League): string[] {
  return league.rosterPositions || ["C", "1B", "2B", "3B", "SS", "OF", "OF", "OF", "UT", "SP", "SP", "RP", "RP", "BN", "BN", "IL"];
}

async function computeCumulativeTeamPointsForLeague(league: League): Promise<Map<number, number>> {
  const leagueTeams = await db.select().from(teams).where(eq(teams.leagueId, league.id));
  const picks = await db.select().from(draftPicks).where(eq(draftPicks.leagueId, league.id));
  const playerIds = Array.from(new Set(picks.map((p) => p.playerId)));
  const playerList = playerIds.length > 0 ? await db.select().from(players).where(inArray(players.id, playerIds)) : [];
  const playerMap = new Map(playerList.map((p) => [p.id, p]));
  const rosterPositions = getDefaultRosterPositions(league);

  const totals = new Map<number, number>();
  for (const team of leagueTeams) {
    const teamPicks = picks.filter((p) => p.teamId === team.id);
    const { total } = computeTeamFantasyPoints(league, teamPicks, playerMap, rosterPositions);
    totals.set(team.id, total);
  }
  return totals;
}

async function captureWeeklyPlayerSnapshots(playerIds: number[], weekStart: string): Promise<void> {
  if (playerIds.length === 0) return;

  const playerList = await db.select().from(players).where(inArray(players.id, playerIds));
  for (const player of playerList) {
    const cumulativeStats = extractS26CumulativeStats(player);
    await db
      .insert(weeklyPlayerStatSnapshots)
      .values({
        playerId: player.id,
        weekStart,
        cumulativeStats,
        capturedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [weeklyPlayerStatSnapshots.playerId, weeklyPlayerStatSnapshots.weekStart],
        set: {
          cumulativeStats,
          capturedAt: new Date(),
        },
      });
  }
}

async function buildWeeklyDeltaPlayerMap(playerIds: number[], weekStart: string): Promise<Map<number, Player>> {
  if (playerIds.length === 0) return new Map();

  const playerList = await db.select().from(players).where(inArray(players.id, playerIds));
  const priorWeekStart = addDaysToYmd(weekStart, -7);

  const snapshots = await db
    .select()
    .from(weeklyPlayerStatSnapshots)
    .where(
      and(
        inArray(weeklyPlayerStatSnapshots.playerId, playerIds),
        inArray(weeklyPlayerStatSnapshots.weekStart, [weekStart, priorWeekStart]),
      ),
    );

  const byPlayerWeek = new Map<string, Record<string, number>>();
  for (const row of snapshots) {
    byPlayerWeek.set(`${row.playerId}:${row.weekStart}`, toNumberRecord(row.cumulativeStats));
  }

  const deltaPlayers = new Map<number, Player>();
  for (const player of playerList) {
    const weekCumulative = byPlayerWeek.get(`${player.id}:${weekStart}`) ?? extractS26CumulativeStats(player);
    const priorCumulative = byPlayerWeek.get(`${player.id}:${priorWeekStart}`) ?? {};

    const weeklyStats: Record<string, number> = {};
    for (const statKey of ALL_STAT_KEYS) {
      weeklyStats[statKey] = Math.max(0, toNumber(weekCumulative[statKey]) - toNumber(priorCumulative[statKey]));
    }

    const deltaPlayer: Player = { ...player };
    for (const [statKey, s26Field] of Object.entries(STAT_TO_S26_PLAYER_FIELD)) {
      (deltaPlayer as Record<string, unknown>)[s26Field] = weeklyStats[statKey];
    }
    deltaPlayers.set(deltaPlayer.id, deltaPlayer);
  }

  return deltaPlayers;
}

async function computeWeeklyRotoBestBallStandingsForLeague(league: League, weekStart: string): Promise<TeamStandings[]> {
  const leagueTeams = await db.select().from(teams).where(eq(teams.leagueId, league.id));
  if (leagueTeams.length === 0) return [];

  const picks = await db.select().from(draftPicks).where(eq(draftPicks.leagueId, league.id));
  const playerIds = Array.from(new Set(picks.map((p) => p.playerId)));
  if (playerIds.length > 0) {
    await captureWeeklyPlayerSnapshots(playerIds, weekStart);
  }

  const weeklyPlayerMap = await buildWeeklyDeltaPlayerMap(playerIds, weekStart);
  return computeRotoStandings(
    league,
    leagueTeams,
    picks,
    weeklyPlayerMap,
    getDefaultRosterPositions(league),
    "s26",
  );
}

async function computeRotoBestBallStandingsFromWeeklySnapshots(
  league: League,
  leagueTeams: Team[],
): Promise<TeamStandings[]> {
  const snapshots = await db
    .select()
    .from(weeklyBestBallRotoPoints)
    .where(eq(weeklyBestBallRotoPoints.leagueId, league.id))
    .orderBy(asc(weeklyBestBallRotoPoints.weekStart));

  const byTeam = new Map<number, typeof snapshots>();
  for (const row of snapshots) {
    const rows = byTeam.get(row.teamId) ?? [];
    rows.push(row);
    byTeam.set(row.teamId, rows);
  }

  const standings: TeamStandings[] = leagueTeams.map((team) => {
    const teamRows = byTeam.get(team.id) ?? [];
    const cumulativeCategoryPoints: Record<string, number> = {};
    let totalPoints = 0;
    let latestCategoryValues: Record<string, number> = {};

    for (const row of teamRows) {
      const rowCategoryPoints = toNumberRecord(row.categoryPoints);
      const rowCategoryValues = toNumberRecord(row.categoryValues);
      for (const [key, value] of Object.entries(rowCategoryPoints)) {
        cumulativeCategoryPoints[key] = (cumulativeCategoryPoints[key] || 0) + value;
      }
      totalPoints += toNumber(row.totalPoints);
      latestCategoryValues = rowCategoryValues;
    }

    return {
      teamId: team.id,
      teamName: team.name,
      userId: team.userId,
      isCpu: team.isCpu,
      categoryValues: latestCategoryValues,
      categoryPoints: cumulativeCategoryPoints,
      totalPoints,
    };
  });

  standings.sort((a, b) => b.totalPoints - a.totalPoints);
  return standings;
}

async function finalizePreviousWeekForLeague(league: League, now: Date = new Date()): Promise<number> {
  if (!shouldUseWeeklyBestBallSnapshots(league)) return 0;

  const ctx = getBestBallWeekContext(league, now);
  if (!ctx.previousWeekStart || !ctx.previousWeekEnd) return 0;

  const leagueTeams = await db.select().from(teams).where(eq(teams.leagueId, league.id));
  if (leagueTeams.length === 0) return 0;

  const existing = await db
    .select()
    .from(weeklyBestBallPoints)
    .where(
      and(
        eq(weeklyBestBallPoints.leagueId, league.id),
        eq(weeklyBestBallPoints.weekStart, ctx.previousWeekStart),
      ),
    );

  if (existing.length >= leagueTeams.length) return 0;

  const cumulativeByTeam = await computeCumulativeTeamPointsForLeague(league);
  const allSnapshots = await db
    .select()
    .from(weeklyBestBallPoints)
    .where(eq(weeklyBestBallPoints.leagueId, league.id))
    .orderBy(asc(weeklyBestBallPoints.weekStart));

  const priorCumulative = new Map<number, number>();
  for (const row of allSnapshots) {
    if (row.weekStart < ctx.previousWeekStart) {
      priorCumulative.set(row.teamId, Math.max(priorCumulative.get(row.teamId) ?? 0, Number(row.cumulativePoints || 0)));
    }
  }

  let writes = 0;
  for (const team of leagueTeams) {
    const cumulativePoints = cumulativeByTeam.get(team.id) ?? 0;
    const prev = priorCumulative.get(team.id) ?? 0;
    const weeklyPoints = Math.max(0, cumulativePoints - prev);
    await db
      .insert(weeklyBestBallPoints)
      .values({
        leagueId: league.id,
        teamId: team.id,
        weekStart: ctx.previousWeekStart,
        weekEnd: ctx.previousWeekEnd,
        weekNumber: ctx.currentWeekNumber - 1,
        weeklyPoints,
        cumulativePoints,
        finalizedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [weeklyBestBallPoints.leagueId, weeklyBestBallPoints.teamId, weeklyBestBallPoints.weekStart],
        set: {
          weekEnd: ctx.previousWeekEnd,
          weekNumber: ctx.currentWeekNumber - 1,
          weeklyPoints,
          cumulativePoints,
          finalizedAt: new Date(),
        },
      });
    writes++;
  }

  return writes;
}

async function finalizePreviousWeekForRotoBestBallLeague(league: League, now: Date = new Date()): Promise<number> {
  if (!shouldUseWeeklyRotoBestBallSnapshots(league)) return 0;

  const ctx = getBestBallWeekContext(league, now);
  if (!ctx.previousWeekStart || !ctx.previousWeekEnd) return 0;

  const leagueTeams = await db.select().from(teams).where(eq(teams.leagueId, league.id));
  if (leagueTeams.length === 0) return 0;

  const existing = await db
    .select()
    .from(weeklyBestBallRotoPoints)
    .where(
      and(
        eq(weeklyBestBallRotoPoints.leagueId, league.id),
        eq(weeklyBestBallRotoPoints.weekStart, ctx.previousWeekStart),
      ),
    );

  if (existing.length >= leagueTeams.length) return 0;

  const weeklyStandings = await computeWeeklyRotoBestBallStandingsForLeague(league, ctx.previousWeekStart);
  let writes = 0;
  for (const row of weeklyStandings) {
    await db
      .insert(weeklyBestBallRotoPoints)
      .values({
        leagueId: league.id,
        teamId: row.teamId,
        weekStart: ctx.previousWeekStart,
        weekEnd: ctx.previousWeekEnd,
        weekNumber: ctx.currentWeekNumber - 1,
        categoryValues: row.categoryValues,
        categoryPoints: row.categoryPoints,
        totalPoints: row.totalPoints,
        finalizedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [weeklyBestBallRotoPoints.leagueId, weeklyBestBallRotoPoints.teamId, weeklyBestBallRotoPoints.weekStart],
        set: {
          weekEnd: ctx.previousWeekEnd,
          weekNumber: ctx.currentWeekNumber - 1,
          categoryValues: row.categoryValues,
          categoryPoints: row.categoryPoints,
          totalPoints: row.totalPoints,
          finalizedAt: new Date(),
        },
      });
    writes++;
  }

  return writes;
}

export async function finalizeBestBallWeeklySnapshots(now: Date = new Date()): Promise<number> {
  const seasonPointsLeagues = await db
    .select()
    .from(leagues)
    .where(
      and(
        eq(leagues.scoringFormat, "Season Points"),
        eq(leagues.type, "Best Ball"),
      ),
    );

  const rotoLeagues = await db
    .select()
    .from(leagues)
    .where(
      and(
        eq(leagues.scoringFormat, "Roto"),
        eq(leagues.type, "Best Ball"),
      ),
    );

  let totalWrites = 0;
  for (const league of seasonPointsLeagues) {
    totalWrites += await finalizePreviousWeekForLeague(league, now);
  }
  for (const league of rotoLeagues) {
    totalWrites += await finalizePreviousWeekForRotoBestBallLeague(league, now);
  }
  return totalWrites;
}

export async function backfillWeeklyBestBallSnapshots(now: Date = new Date()): Promise<{ leagues: number; snapshots: number }> {
  const seasonPointsLeagues = await db
    .select()
    .from(leagues)
    .where(
      and(
        eq(leagues.scoringFormat, "Season Points"),
        eq(leagues.type, "Best Ball"),
        eq(leagues.draftStatus, "active"),
      ),
    );

  let snapshots = 0;
  for (const league of seasonPointsLeagues) {
    const completedWeeks = listCompletedWeekStarts(league, now);
    if (completedWeeks.length === 0) continue;

    const weekStarts = completedWeeks.sort();
    const lastCompletedWeek = weekStarts[weekStarts.length - 1];
    const anchorCtx = getBestBallWeekContext(league, now);
    const leagueTeams = await db.select().from(teams).where(eq(teams.leagueId, league.id));
    if (leagueTeams.length === 0) continue;

    const cumulativeByTeam = await computeCumulativeTeamPointsForLeague(league);

    for (const team of leagueTeams) {
      const cumulativePoints = cumulativeByTeam.get(team.id) ?? 0;
      for (const weekStart of weekStarts) {
        const isLast = weekStart === lastCompletedWeek;
        const weekEnd = addDaysToYmd(weekStart, 6);
        const weekNumber = weekNumberFromAnchor(anchorCtx.anchorWeekStart, weekStart);
        await db
          .insert(weeklyBestBallPoints)
          .values({
            leagueId: league.id,
            teamId: team.id,
            weekStart,
            weekEnd,
            weekNumber,
            weeklyPoints: isLast ? cumulativePoints : 0,
            cumulativePoints: isLast ? cumulativePoints : 0,
            finalizedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [weeklyBestBallPoints.leagueId, weeklyBestBallPoints.teamId, weeklyBestBallPoints.weekStart],
            set: {
              weekEnd,
              weekNumber,
              weeklyPoints: isLast ? cumulativePoints : 0,
              cumulativePoints: isLast ? cumulativePoints : 0,
              finalizedAt: new Date(),
            },
          });
        snapshots++;
      }
    }
  }

  const rotoLeagues = await db
    .select()
    .from(leagues)
    .where(
      and(
        eq(leagues.scoringFormat, "Roto"),
        eq(leagues.type, "Best Ball"),
        eq(leagues.draftStatus, "active"),
      ),
    );

  for (const league of rotoLeagues) {
    const completedWeeks = listCompletedWeekStarts(league, now).sort();
    if (completedWeeks.length === 0) continue;

    const picks = await db.select().from(draftPicks).where(eq(draftPicks.leagueId, league.id));
    const playerIds = Array.from(new Set(picks.map((p) => p.playerId)));
    const anchorCtx = getBestBallWeekContext(league, now);

    // Best-effort backfill: only weeks with sufficient snapshots can be computed exactly.
    for (const weekStart of completedWeeks) {
      const existingRows = await db
        .select()
        .from(weeklyBestBallRotoPoints)
        .where(
          and(
            eq(weeklyBestBallRotoPoints.leagueId, league.id),
            eq(weeklyBestBallRotoPoints.weekStart, weekStart),
          ),
        );
      if (existingRows.length > 0) continue;

      if (weekStart === completedWeeks[completedWeeks.length - 1] && playerIds.length > 0) {
        await captureWeeklyPlayerSnapshots(playerIds, weekStart);
      }

      const weeklyStandings = await computeWeeklyRotoBestBallStandingsForLeague(league, weekStart);
      if (weeklyStandings.length === 0) continue;

      const weekEnd = addDaysToYmd(weekStart, 6);
      const weekNumber = weekNumberFromAnchor(anchorCtx.anchorWeekStart, weekStart);
      for (const row of weeklyStandings) {
        await db
          .insert(weeklyBestBallRotoPoints)
          .values({
            leagueId: league.id,
            teamId: row.teamId,
            weekStart,
            weekEnd,
            weekNumber,
            categoryValues: row.categoryValues,
            categoryPoints: row.categoryPoints,
            totalPoints: row.totalPoints,
            finalizedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [weeklyBestBallRotoPoints.leagueId, weeklyBestBallRotoPoints.teamId, weeklyBestBallRotoPoints.weekStart],
            set: {
              weekEnd,
              weekNumber,
              categoryValues: row.categoryValues,
              categoryPoints: row.categoryPoints,
              totalPoints: row.totalPoints,
              finalizedAt: new Date(),
            },
          });
        snapshots++;
      }
    }
  }

  return { leagues: seasonPointsLeagues.length + rotoLeagues.length, snapshots };
}

export async function computeStandings(
  league: League,
  teams: Team[],
  draftPicks: DraftPick[],
  allPlayers: Map<number, Player>,
  rosterPositions: string[],
) {
  const format = league.scoringFormat || "Roto";

  switch (format) {
    case "H2H Points":
      return {
        format: "H2H Points",
        standings: computeH2HPointsStandings(league, teams, draftPicks, allPlayers, rosterPositions),
        hittingCategories: league.hittingCategories || ["R", "HR", "RBI", "SB", "AVG"],
        pitchingCategories: league.pitchingCategories || ["W", "SV", "K", "ERA", "WHIP"],
        numTeams: teams.length,
      };
    case "H2H Each Category":
      return {
        format: "H2H Each Category",
        standings: computeH2HEachCategoryStandings(league, teams, draftPicks, allPlayers, rosterPositions),
        hittingCategories: league.hittingCategories || ["R", "HR", "RBI", "SB", "AVG"],
        pitchingCategories: league.pitchingCategories || ["W", "SV", "K", "ERA", "WHIP"],
        numTeams: teams.length,
      };
    case "H2H Most Categories":
      return {
        format: "H2H Most Categories",
        standings: computeH2HMostCategoriesStandings(league, teams, draftPicks, allPlayers, rosterPositions),
        hittingCategories: league.hittingCategories || ["R", "HR", "RBI", "SB", "AVG"],
        pitchingCategories: league.pitchingCategories || ["W", "SV", "K", "ERA", "WHIP"],
        numTeams: teams.length,
      };
    case "Season Points":
      return {
        format: "Season Points",
        standings: await computeSeasonPointsStandings(league, teams, draftPicks, allPlayers, rosterPositions),
        hittingCategories: league.hittingCategories || ["R", "HR", "RBI", "SB", "AVG"],
        pitchingCategories: league.pitchingCategories || ["W", "SV", "K", "ERA", "WHIP"],
        numTeams: teams.length,
      };
    case "Roto":
    default:
      return {
        format: "Roto",
        standings: shouldUseWeeklyRotoBestBallSnapshots(league)
          ? await computeRotoBestBallStandingsFromWeeklySnapshots(league, teams)
          : computeRotoStandings(league, teams, draftPicks, allPlayers, rosterPositions, "s26"),
        hittingCategories: league.hittingCategories || ["R", "HR", "RBI", "SB", "AVG"],
        pitchingCategories: league.pitchingCategories || ["W", "SV", "K", "ERA", "WHIP"],
        numTeams: teams.length,
      };
  }
}
