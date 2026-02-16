import type { Player, League, Team, DraftPick } from "@shared/schema";
import { computeRotoStandings, type TeamStandings } from "./roto-scoring";

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

function isPitchingSlot(slotPos: string): boolean {
  return PITCHING_POSITIONS.includes(slotPos);
}

function isActiveSlot(slotPos: string): boolean {
  return slotPos !== "BN" && slotPos !== "IL";
}

const COUNTING_STAT_POINTS: Record<string, number> = {
  R: 1, HR: 4, RBI: 1, SB: 2, H: 0.5, "2B": 1, "3B": 2, BB: 1, HBP: 1, TB: 0.5, CS: -1,
  W: 5, SV: 5, K: 1, QS: 3, HLD: 2, SO: 1, L: -2, CG: 3, SHO: 5, BSV: -2,
};

function computeTeamFantasyPoints(
  league: League,
  teamPicks: DraftPick[],
  allPlayers: Map<number, Player>,
  rosterPositions: string[],
): { total: number; categoryValues: Record<string, number> } {
  const hittingCats = league.hittingCategories || ["R", "HR", "RBI", "SB", "AVG"];
  const pitchingCats = league.pitchingCategories || ["W", "SV", "K", "ERA", "WHIP"];

  const categoryValues: Record<string, number> = {};
  let total = 0;

  const hittingAccum: Record<string, number> = {};
  const pitchingAccum: Record<string, number> = {};

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

    const statKeys = ["statR", "statHR", "statRBI", "statSB", "statH", "stat2B", "stat3B",
      "statBB", "statK", "statTB", "statCS", "statHBP", "statAB", "statPA",
      "statW", "statSV", "statSO", "statL", "statQS", "statHLD", "statCG", "statSHO", "statBSV",
      "statIPOuts", "statER", "statBBp", "statHA"];

    for (const key of statKeys) {
      const remapped = key.replace(/^stat/, "s26");
      const val = (player as Record<string, unknown>)[remapped];
      if (typeof val === "number") {
        accum[key] = (accum[key] || 0) + val;
      } else if (typeof val === "string") {
        const num = parseFloat(val);
        if (!isNaN(num)) accum[key] = (accum[key] || 0) + num;
      }
    }
  }

  for (const cat of hittingCats) {
    const statMap: Record<string, string> = {
      R: "statR", HR: "statHR", RBI: "statRBI", SB: "statSB", H: "statH",
      "2B": "stat2B", "3B": "stat3B", BB: "statBB", K: "statK", TB: "statTB",
      CS: "statCS", HBP: "statHBP",
    };
    const key = statMap[cat];
    const val = key ? (hittingAccum[key] || 0) : 0;
    categoryValues[`h_${cat}`] = val;
    const pts = (COUNTING_STAT_POINTS[cat] || 0) * val;
    total += pts;
  }

  for (const cat of pitchingCats) {
    const statMap: Record<string, string> = {
      W: "statW", SV: "statSV", K: "statSO", SO: "statSO", L: "statL",
      QS: "statQS", HLD: "statHLD", CG: "statCG", SHO: "statSHO", BSV: "statBSV",
    };
    const key = statMap[cat];
    const val = key ? (pitchingAccum[key] || 0) : 0;
    categoryValues[`p_${cat}`] = val;
    const pts = (COUNTING_STAT_POINTS[cat] || 0) * val;
    total += pts;
  }

  return { total, categoryValues };
}

export function computeSeasonPointsStandings(
  league: League,
  teams: Team[],
  draftPicks: DraftPick[],
  allPlayers: Map<number, Player>,
  rosterPositions: string[],
): PointsStandings[] {
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

export function computeStandings(
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
        standings: computeSeasonPointsStandings(league, teams, draftPicks, allPlayers, rosterPositions),
        hittingCategories: league.hittingCategories || ["R", "HR", "RBI", "SB", "AVG"],
        pitchingCategories: league.pitchingCategories || ["W", "SV", "K", "ERA", "WHIP"],
        numTeams: teams.length,
      };
    case "Roto":
    default:
      return {
        format: "Roto",
        standings: computeRotoStandings(league, teams, draftPicks, allPlayers, rosterPositions, "s26"),
        hittingCategories: league.hittingCategories || ["R", "HR", "RBI", "SB", "AVG"],
        pitchingCategories: league.pitchingCategories || ["W", "SV", "K", "ERA", "WHIP"],
        numTeams: teams.length,
      };
  }
}
