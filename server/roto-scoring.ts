import type { Player, League, Team, DraftPick } from "@shared/schema";

export interface CategoryConfig {
  id: string;
  direction: "higher" | "lower";
  type: "counting" | "ratio";
  numerator?: string[];
  denominator?: string[];
  computeRatio?: (num: number, den: number) => number;
  playerStatKey: string;
  isHitting: boolean;
}

const HITTING_CATEGORY_CONFIGS: Record<string, CategoryConfig> = {
  R:   { id: "R",   direction: "higher", type: "counting", playerStatKey: "statR",   isHitting: true },
  HR:  { id: "HR",  direction: "higher", type: "counting", playerStatKey: "statHR",  isHitting: true },
  RBI: { id: "RBI", direction: "higher", type: "counting", playerStatKey: "statRBI", isHitting: true },
  SB:  { id: "SB",  direction: "higher", type: "counting", playerStatKey: "statSB",  isHitting: true },
  H:   { id: "H",   direction: "higher", type: "counting", playerStatKey: "statH",   isHitting: true },
  "2B":{ id: "2B",  direction: "higher", type: "counting", playerStatKey: "stat2B",  isHitting: true },
  "3B":{ id: "3B",  direction: "higher", type: "counting", playerStatKey: "stat3B",  isHitting: true },
  BB:  { id: "BB",  direction: "higher", type: "counting", playerStatKey: "statBB",  isHitting: true },
  K:   { id: "K",   direction: "lower",  type: "counting", playerStatKey: "statK",   isHitting: true },
  TB:  { id: "TB",  direction: "higher", type: "counting", playerStatKey: "statTB",  isHitting: true },
  CS:  { id: "CS",  direction: "lower",  type: "counting", playerStatKey: "statCS",  isHitting: true },
  HBP: { id: "HBP", direction: "higher", type: "counting", playerStatKey: "statHBP", isHitting: true },
  AVG: {
    id: "AVG", direction: "higher", type: "ratio", playerStatKey: "statAVG", isHitting: true,
    numerator: ["statH"], denominator: ["statAB"],
    computeRatio: (h, ab) => ab === 0 ? 0 : h / ab,
  },
  OBP: {
    id: "OBP", direction: "higher", type: "ratio", playerStatKey: "statOBP", isHitting: true,
    numerator: ["statH", "statBB", "statHBP"], denominator: ["statPA"],
    computeRatio: (num, den) => den === 0 ? 0 : num / den,
  },
  SLG: {
    id: "SLG", direction: "higher", type: "ratio", playerStatKey: "statSLG", isHitting: true,
    numerator: ["statTB"], denominator: ["statAB"],
    computeRatio: (tb, ab) => ab === 0 ? 0 : tb / ab,
  },
  OPS: {
    id: "OPS", direction: "higher", type: "ratio", playerStatKey: "statOPS", isHitting: true,
    numerator: ["statH", "statBB", "statHBP", "statTB"],
    denominator: ["statPA", "statAB"],
    computeRatio: (num, den) => 0,
  },
};

const PITCHING_CATEGORY_CONFIGS: Record<string, CategoryConfig> = {
  W:    { id: "W",    direction: "higher", type: "counting", playerStatKey: "statW",   isHitting: false },
  SV:   { id: "SV",   direction: "higher", type: "counting", playerStatKey: "statSV",  isHitting: false },
  K:    { id: "K",    direction: "higher", type: "counting", playerStatKey: "statSO",  isHitting: false },
  L:    { id: "L",    direction: "lower",  type: "counting", playerStatKey: "statL",   isHitting: false },
  QS:   { id: "QS",   direction: "higher", type: "counting", playerStatKey: "statQS",  isHitting: false },
  HLD:  { id: "HLD",  direction: "higher", type: "counting", playerStatKey: "statHLD", isHitting: false },
  IP:   { id: "IP",   direction: "higher", type: "counting", playerStatKey: "statIPOuts", isHitting: false },
  SO:   { id: "SO",   direction: "higher", type: "counting", playerStatKey: "statSO",  isHitting: false },
  BB:   { id: "BB",   direction: "lower",  type: "counting", playerStatKey: "statBBp", isHitting: false },
  HR:   { id: "HR",   direction: "lower",  type: "counting", playerStatKey: "statHRp", isHitting: false },
  CG:   { id: "CG",   direction: "higher", type: "counting", playerStatKey: "statCG",  isHitting: false },
  SHO:  { id: "SHO",  direction: "higher", type: "counting", playerStatKey: "statSHO", isHitting: false },
  BSV:  { id: "BSV",  direction: "lower",  type: "counting", playerStatKey: "statBSV", isHitting: false },
  ERA: {
    id: "ERA", direction: "lower", type: "ratio", playerStatKey: "statERA", isHitting: false,
    numerator: ["statER"], denominator: ["statIPOuts"],
    computeRatio: (er, ipOuts) => ipOuts === 0 ? 0 : (er * 27) / ipOuts,
  },
  WHIP: {
    id: "WHIP", direction: "lower", type: "ratio", playerStatKey: "statWHIP", isHitting: false,
    numerator: ["statBBp", "statHA"], denominator: ["statIPOuts"],
    computeRatio: (num, den) => den === 0 ? 0 : (num * 3) / den,
  },
  "K/9": {
    id: "K/9", direction: "higher", type: "ratio", playerStatKey: "statSO", isHitting: false,
    numerator: ["statSO"], denominator: ["statIPOuts"],
    computeRatio: (so, ipOuts) => ipOuts === 0 ? 0 : (so * 27) / ipOuts,
  },
};

function getCategoryConfig(catId: string, isHitting: boolean): CategoryConfig | null {
  if (isHitting) return HITTING_CATEGORY_CONFIGS[catId] || null;
  return PITCHING_CATEGORY_CONFIGS[catId] || null;
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

function canFillBestBallSlot(slot: string, playerPos: string): boolean {
  if (slot === "C") return playerPos === "C";
  if (slot === "INF") return INF_POSITIONS.includes(playerPos) || playerPos === "INF";
  if (slot === "OF") return OF_POSITIONS.includes(playerPos) || playerPos === "DH" || playerPos === "UT";
  if (slot === "SP") return playerPos === "SP";
  if (slot === "RP") return playerPos === "RP";
  if (slot === "UT" || slot === "DH") return !PITCHING_POSITIONS.includes(playerPos);
  return false;
}

function selectOptimalLineup(
  teamPlayers: Player[],
  rosterPositions: string[],
  statKey: string,
  direction: "higher" | "lower",
  isHittingCategory: boolean,
  statPrefix: string
): Player[] {
  const remapKey = (key: string): string => {
    if (statPrefix === "stat") return key;
    return key.replace(/^stat/, statPrefix);
  };

  const mappedKey = remapKey(statKey);

  const getPlayerStat = (p: Player): number => {
    const val = (p as Record<string, unknown>)[mappedKey];
    if (typeof val === "number") return val;
    if (typeof val === "string") { const n = parseFloat(val); return isNaN(n) ? 0 : n; }
    return 0;
  };

  const activeSlots = rosterPositions.filter(s => isActiveSlot(s));

  const hittingSlots = activeSlots.filter(s => !isPitchingSlot(s));
  const pitchingSlots = activeSlots.filter(s => isPitchingSlot(s));
  const slotsToFill = isHittingCategory ? hittingSlots : pitchingSlots;

  const candidates = teamPlayers.filter(p => {
    if (isHittingCategory) return !PITCHING_POSITIONS.includes(p.position);
    return PITCHING_POSITIONS.includes(p.position);
  });

  const sorted = [...candidates].sort((a, b) => {
    const aVal = getPlayerStat(a);
    const bVal = getPlayerStat(b);
    return direction === "higher" ? bVal - aVal : aVal - bVal;
  });

  const selected: Player[] = [];
  const usedPlayerIds = new Set<number>();
  const slotsFilled = new Array(slotsToFill.length).fill(false);

  for (const player of sorted) {
    if (usedPlayerIds.has(player.id)) continue;

    for (let i = 0; i < slotsToFill.length; i++) {
      if (slotsFilled[i]) continue;
      if (canFillBestBallSlot(slotsToFill[i], player.position)) {
        selected.push(player);
        usedPlayerIds.add(player.id);
        slotsFilled[i] = true;
        break;
      }
    }

    if (selected.length >= slotsToFill.length) break;
  }

  return selected;
}

function selectOptimalLineupForRatio(
  teamPlayers: Player[],
  rosterPositions: string[],
  cfg: CategoryConfig,
  isHittingCategory: boolean,
  statPrefix: string
): Player[] {
  const remapKey = (key: string): string => {
    if (statPrefix === "stat") return key;
    return key.replace(/^stat/, statPrefix);
  };

  const getPlayerStatNum = (p: Player, keys: string[]): number => {
    return keys.reduce((sum, k) => {
      const mk = remapKey(k);
      const val = (p as Record<string, unknown>)[mk];
      if (typeof val === "number") return sum + val;
      if (typeof val === "string") { const n = parseFloat(val); return isNaN(n) ? sum : sum + n; }
      return sum;
    }, 0);
  };

  const activeSlots = rosterPositions.filter(s => isActiveSlot(s));
  const hittingSlots = activeSlots.filter(s => !isPitchingSlot(s));
  const pitchingSlots = activeSlots.filter(s => isPitchingSlot(s));
  const slotsToFill = isHittingCategory ? hittingSlots : pitchingSlots;

  const candidates = teamPlayers.filter(p => {
    if (isHittingCategory) return !PITCHING_POSITIONS.includes(p.position);
    return PITCHING_POSITIONS.includes(p.position);
  });

  const scored = candidates.map(p => {
    const den = getPlayerStatNum(p, cfg.denominator || []);
    if (den === 0) return { player: p, ratio: cfg.direction === "lower" ? Infinity : -Infinity, den };
    const num = getPlayerStatNum(p, cfg.numerator || []);
    const ratio = cfg.computeRatio ? cfg.computeRatio(num, den) : 0;
    return { player: p, ratio, den };
  });

  const withActivity = scored.filter(s => s.den > 0);
  withActivity.sort((a, b) => {
    return cfg.direction === "higher" ? b.ratio - a.ratio : a.ratio - b.ratio;
  });

  const selected: Player[] = [];
  const usedPlayerIds = new Set<number>();
  const slotsFilled = new Array(slotsToFill.length).fill(false);

  for (const { player } of withActivity) {
    if (usedPlayerIds.has(player.id)) continue;
    for (let i = 0; i < slotsToFill.length; i++) {
      if (slotsFilled[i]) continue;
      if (canFillBestBallSlot(slotsToFill[i], player.position)) {
        selected.push(player);
        usedPlayerIds.add(player.id);
        slotsFilled[i] = true;
        break;
      }
    }
    if (selected.length >= slotsToFill.length) break;
  }

  return selected;
}

export interface TeamStandings {
  teamId: number;
  teamName: string;
  userId: number | null;
  userName?: string;
  isCpu: boolean | null;
  categoryValues: Record<string, number>;
  categoryPoints: Record<string, number>;
  totalPoints: number;
}

export function computeRotoStandings(
  league: League,
  teams: Team[],
  draftPicks: DraftPick[],
  allPlayers: Map<number, Player>,
  rosterPositions: string[],
  statPrefix: string = "s26"
): TeamStandings[] {
  const hittingCats = league.hittingCategories || ["R", "HR", "RBI", "SB", "AVG"];
  const pitchingCats = league.pitchingCategories || ["W", "SV", "K", "ERA", "WHIP"];
  const numTeams = teams.length;
  const isBestBall = league.type === "Best Ball";

  const remapKey = (key: string): string => {
    if (statPrefix === "stat") return key;
    return key.replace(/^stat/, statPrefix);
  };

  const teamStats: Map<number, Record<string, number>> = new Map();

  const allStatKeys = new Set<string>();
  for (const cat of hittingCats) {
    const cfg = getCategoryConfig(cat, true);
    if (!cfg) continue;
    if (cfg.type === "ratio") {
      cfg.numerator?.forEach(k => allStatKeys.add(k));
      cfg.denominator?.forEach(k => allStatKeys.add(k));
    }
    allStatKeys.add(cfg.playerStatKey);
  }
  for (const cat of pitchingCats) {
    const cfg = getCategoryConfig(cat, false);
    if (!cfg) continue;
    if (cfg.type === "ratio") {
      cfg.numerator?.forEach(k => allStatKeys.add(k));
      cfg.denominator?.forEach(k => allStatKeys.add(k));
    }
    allStatKeys.add(cfg.playerStatKey);
  }

  for (const team of teams) {
    const teamPicks = draftPicks.filter(dp => dp.teamId === team.id);
    const teamPlayers = teamPicks.map(p => allPlayers.get(p.playerId)).filter(Boolean) as Player[];

    if (isBestBall) {
      const categoryValues: Record<string, number> = {};

      for (const cat of hittingCats) {
        const cfg = getCategoryConfig(cat, true);
        if (!cfg) { categoryValues[`h_${cat}`] = 0; continue; }

        let optimalPlayers: Player[];
        if (cfg.type === "ratio" && cat !== "OPS") {
          optimalPlayers = selectOptimalLineupForRatio(teamPlayers, rosterPositions, cfg, true, statPrefix);
        } else if (cat === "OPS") {
          const obpCfg = getCategoryConfig("OBP", true);
          optimalPlayers = obpCfg
            ? selectOptimalLineupForRatio(teamPlayers, rosterPositions, obpCfg, true, statPrefix)
            : teamPlayers.filter(p => !PITCHING_POSITIONS.includes(p.position));
        } else {
          optimalPlayers = selectOptimalLineup(teamPlayers, rosterPositions, cfg.playerStatKey, cfg.direction, true, statPrefix);
        }

        const accum: Record<string, number> = {};
        allStatKeys.forEach(k => { accum[k] = 0; });
        for (const player of optimalPlayers) {
          allStatKeys.forEach(key => {
            const playerKey = remapKey(key);
            const val = (player as Record<string, unknown>)[playerKey];
            if (typeof val === "number") accum[key] += val;
            else if (typeof val === "string") { const n = parseFloat(val); if (!isNaN(n)) accum[key] += n; }
          });
        }

        if (cfg.type === "counting") {
          categoryValues[`h_${cat}`] = accum[cfg.playerStatKey] || 0;
        } else if (cfg.type === "ratio" && cfg.computeRatio && cat !== "OPS") {
          const numVal = (cfg.numerator || []).reduce((s, k) => s + (accum[k] || 0), 0);
          const denVal = (cfg.denominator || []).reduce((s, k) => s + (accum[k] || 0), 0);
          categoryValues[`h_${cat}`] = cfg.computeRatio(numVal, denVal);
        } else if (cat === "OPS") {
          const h = accum["statH"] || 0, bb = accum["statBB"] || 0, hbp = accum["statHBP"] || 0;
          const pa = accum["statPA"] || 0, tb = accum["statTB"] || 0, ab = accum["statAB"] || 0;
          categoryValues[`h_${cat}`] = (pa === 0 ? 0 : (h + bb + hbp) / pa) + (ab === 0 ? 0 : tb / ab);
        }
      }

      for (const cat of pitchingCats) {
        const cfg = getCategoryConfig(cat, false);
        if (!cfg) { categoryValues[`p_${cat}`] = 0; continue; }

        let optimalPlayers: Player[];
        if (cfg.type === "ratio") {
          optimalPlayers = selectOptimalLineupForRatio(teamPlayers, rosterPositions, cfg, false, statPrefix);
        } else {
          optimalPlayers = selectOptimalLineup(teamPlayers, rosterPositions, cfg.playerStatKey, cfg.direction, false, statPrefix);
        }

        const accum: Record<string, number> = {};
        allStatKeys.forEach(k => { accum[k] = 0; });
        for (const player of optimalPlayers) {
          allStatKeys.forEach(key => {
            const playerKey = remapKey(key);
            const val = (player as Record<string, unknown>)[playerKey];
            if (typeof val === "number") accum[key] += val;
            else if (typeof val === "string") { const n = parseFloat(val); if (!isNaN(n)) accum[key] += n; }
          });
        }

        if (cfg.type === "counting") {
          let val = accum[cfg.playerStatKey] || 0;
          if (cat === "IP") { const outs = val; val = Math.floor(outs / 3) + (outs % 3) / 10; }
          categoryValues[`p_${cat}`] = val;
        } else if (cfg.type === "ratio" && cfg.computeRatio) {
          const numVal = (cfg.numerator || []).reduce((s, k) => s + (accum[k] || 0), 0);
          const denVal = (cfg.denominator || []).reduce((s, k) => s + (accum[k] || 0), 0);
          categoryValues[`p_${cat}`] = cfg.computeRatio(numVal, denVal);
        }
      }

      teamStats.set(team.id, categoryValues);
    } else {
      const hittingAccum: Record<string, number> = {};
      const pitchingAccum: Record<string, number> = {};
      allStatKeys.forEach(k => { hittingAccum[k] = 0; pitchingAccum[k] = 0; });

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
        allStatKeys.forEach(key => {
          const playerKey = remapKey(key);
          const val = (player as Record<string, unknown>)[playerKey];
          if (typeof val === "number") accum[key] += val;
          else if (typeof val === "string") { const num = parseFloat(val); if (!isNaN(num)) accum[key] += num; }
        });
      }

      const categoryValues: Record<string, number> = {};
      for (const cat of hittingCats) {
        const cfg = getCategoryConfig(cat, true);
        if (!cfg) { categoryValues[`h_${cat}`] = 0; continue; }
        if (cfg.type === "counting") {
          categoryValues[`h_${cat}`] = hittingAccum[cfg.playerStatKey] || 0;
        } else if (cfg.type === "ratio" && cfg.computeRatio && cat !== "OPS") {
          const numVal = (cfg.numerator || []).reduce((s, k) => s + (hittingAccum[k] || 0), 0);
          const denVal = (cfg.denominator || []).reduce((s, k) => s + (hittingAccum[k] || 0), 0);
          categoryValues[`h_${cat}`] = cfg.computeRatio(numVal, denVal);
        } else if (cat === "OPS") {
          const h = hittingAccum["statH"] || 0, bb = hittingAccum["statBB"] || 0, hbp = hittingAccum["statHBP"] || 0;
          const pa = hittingAccum["statPA"] || 0, tb = hittingAccum["statTB"] || 0, ab = hittingAccum["statAB"] || 0;
          categoryValues[`h_${cat}`] = (pa === 0 ? 0 : (h + bb + hbp) / pa) + (ab === 0 ? 0 : tb / ab);
        }
      }
      for (const cat of pitchingCats) {
        const cfg = getCategoryConfig(cat, false);
        if (!cfg) { categoryValues[`p_${cat}`] = 0; continue; }
        if (cfg.type === "counting") {
          let val = pitchingAccum[cfg.playerStatKey] || 0;
          if (cat === "IP") { const outs = val; val = Math.floor(outs / 3) + (outs % 3) / 10; }
          categoryValues[`p_${cat}`] = val;
        } else if (cfg.type === "ratio" && cfg.computeRatio) {
          const numVal = (cfg.numerator || []).reduce((s, k) => s + (pitchingAccum[k] || 0), 0);
          const denVal = (cfg.denominator || []).reduce((s, k) => s + (pitchingAccum[k] || 0), 0);
          categoryValues[`p_${cat}`] = cfg.computeRatio(numVal, denVal);
        }
      }
      teamStats.set(team.id, categoryValues);
    }
  }

  const allCategories = [
    ...hittingCats.map(c => ({ key: `h_${c}`, id: c, isHitting: true })),
    ...pitchingCats.map(c => ({ key: `p_${c}`, id: c, isHitting: false })),
  ];

  const teamPoints: Map<number, Record<string, number>> = new Map();
  teams.forEach(t => teamPoints.set(t.id, {}));

  for (const cat of allCategories) {
    const cfg = getCategoryConfig(cat.id, cat.isHitting);
    const direction = cfg?.direction || "higher";

    const teamValues = teams.map(t => ({
      teamId: t.id,
      value: teamStats.get(t.id)?.[cat.key] || 0,
    }));

    teamValues.sort((a, b) => {
      if (direction === "higher") return b.value - a.value;
      return a.value - b.value;
    });

    let i = 0;
    while (i < teamValues.length) {
      let j = i;
      while (j < teamValues.length && teamValues[j].value === teamValues[i].value) {
        j++;
      }
      const tiedCount = j - i;
      let totalPts = 0;
      for (let k = i; k < j; k++) {
        totalPts += numTeams - k;
      }
      const avgPts = totalPts / tiedCount;

      for (let k = i; k < j; k++) {
        const pts = teamPoints.get(teamValues[k].teamId)!;
        pts[cat.key] = avgPts;
      }
      i = j;
    }
  }

  const results: TeamStandings[] = teams.map(team => {
    const catPts = teamPoints.get(team.id) || {};
    const catVals = teamStats.get(team.id) || {};
    let total = 0;
    for (const cat of allCategories) {
      total += catPts[cat.key] || 0;
    }
    return {
      teamId: team.id,
      teamName: team.name,
      userId: team.userId,
      isCpu: team.isCpu,
      categoryValues: catVals,
      categoryPoints: catPts,
      totalPoints: total,
    };
  });

  results.sort((a, b) => b.totalPoints - a.totalPoints);
  return results;
}
