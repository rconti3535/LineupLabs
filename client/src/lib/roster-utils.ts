import type { Player, DraftPick } from "@shared/schema";

const INF_POSITIONS = ["1B", "2B", "3B", "SS"];

function canFitSlot(playerPosition: string, slotPosition: string): boolean {
  if (slotPosition === "BN" || slotPosition === "IL") return true;
  if (slotPosition === "UT") {
    return !["SP", "RP"].includes(playerPosition);
  }
  if (slotPosition === "OF") {
    return ["OF", "LF", "CF", "RF"].includes(playerPosition);
  }
  if (slotPosition === "INF") {
    return INF_POSITIONS.includes(playerPosition);
  }
  if (slotPosition === "P") {
    return ["SP", "RP"].includes(playerPosition);
  }
  return playerPosition === slotPosition;
}

export function assignPlayersToRoster(
  rosterPositions: string[],
  players: Player[]
): (Player | null)[] {
  const assigned: (Player | null)[] = new Array(rosterPositions.length).fill(null);
  const usedPlayers = new Set<number>();

  for (const player of players) {
    const exactIndex = rosterPositions.findIndex(
      (slot, i) => assigned[i] === null && slot === player.position
    );
    if (exactIndex !== -1) {
      assigned[exactIndex] = player;
      usedPlayers.add(player.id);
      continue;
    }

    const ofIndex = rosterPositions.findIndex(
      (slot, i) => assigned[i] === null && slot === "OF" && ["OF", "LF", "CF", "RF"].includes(player.position)
    );
    if (ofIndex !== -1) {
      assigned[ofIndex] = player;
      usedPlayers.add(player.id);
      continue;
    }

    const infIndex = rosterPositions.findIndex(
      (slot, i) => assigned[i] === null && slot === "INF" && INF_POSITIONS.includes(player.position)
    );
    if (infIndex !== -1) {
      assigned[infIndex] = player;
      usedPlayers.add(player.id);
      continue;
    }

    if (["SP", "RP"].includes(player.position)) {
      const pIndex = rosterPositions.findIndex(
        (slot, i) => assigned[i] === null && slot === "P"
      );
      if (pIndex !== -1) {
        assigned[pIndex] = player;
        usedPlayers.add(player.id);
        continue;
      }
    }

    if (!["SP", "RP"].includes(player.position)) {
      const utilIndex = rosterPositions.findIndex(
        (slot, i) => assigned[i] === null && slot === "UT"
      );
      if (utilIndex !== -1) {
        assigned[utilIndex] = player;
        usedPlayers.add(player.id);
        continue;
      }
    }

    const bnIndex = rosterPositions.findIndex(
      (slot, i) => assigned[i] === null && slot === "BN"
    );
    if (bnIndex !== -1) {
      assigned[bnIndex] = player;
      usedPlayers.add(player.id);
      continue;
    }

    const ilIndex = rosterPositions.findIndex(
      (slot, i) => assigned[i] === null && slot === "IL"
    );
    if (ilIndex !== -1) {
      assigned[ilIndex] = player;
      usedPlayers.add(player.id);
    }
  }

  return assigned;
}

export interface RosterEntry {
  player: Player | null;
  pickId: number | null;
  slotIndex: number;
  slotPos: string;
}

export function assignPlayersToRosterWithPicks(
  rosterPositions: string[],
  players: Player[],
  picks: DraftPick[]
): RosterEntry[] {
  const result: RosterEntry[] = rosterPositions.map((pos, i) => ({
    player: null,
    pickId: null,
    slotIndex: i,
    slotPos: pos,
  }));

  const playerMap = new Map<number, Player>();
  players.forEach(p => playerMap.set(p.id, p));

  const picksByPlayerId = new Map<number, DraftPick>();
  picks.forEach(p => picksByPlayerId.set(p.playerId, p));

  const hasPersistedSlots = picks.some(p => p.rosterSlot !== null && p.rosterSlot !== undefined);

  if (hasPersistedSlots) {
    const usedSlots = new Set<number>();
    const unassignedPicks: DraftPick[] = [];

    for (const pick of picks) {
      if (pick.rosterSlot !== null && pick.rosterSlot !== undefined && pick.rosterSlot < rosterPositions.length) {
        const player = playerMap.get(pick.playerId);
        if (player && !usedSlots.has(pick.rosterSlot)) {
          result[pick.rosterSlot].player = player;
          result[pick.rosterSlot].pickId = pick.id;
          usedSlots.add(pick.rosterSlot);
        } else {
          unassignedPicks.push(pick);
        }
      } else {
        unassignedPicks.push(pick);
      }
    }

    for (const pick of unassignedPicks) {
      const player = playerMap.get(pick.playerId);
      if (!player) continue;
      for (let i = 0; i < rosterPositions.length; i++) {
        if (usedSlots.has(i)) continue;
        if (canFitSlot(player.position, rosterPositions[i])) {
          result[i].player = player;
          result[i].pickId = pick.id;
          usedSlots.add(i);
          break;
        }
      }
    }
  } else {
    const assigned = assignPlayersToRoster(rosterPositions, players);
    for (let i = 0; i < assigned.length; i++) {
      const player = assigned[i];
      if (player) {
        result[i].player = player;
        const pick = picksByPlayerId.get(player.id);
        result[i].pickId = pick ? pick.id : null;
      }
    }
  }

  return result;
}

export function getSwapTargets(
  rosterEntries: RosterEntry[],
  fromIndex: number,
  rosterPositions: string[]
): number[] {
  const entry = rosterEntries[fromIndex];
  if (!entry || !entry.player) return [];

  const sourcePlayer = entry.player;
  const targets: number[] = [];

  for (let i = 0; i < rosterEntries.length; i++) {
    if (i === fromIndex) continue;
    const targetSlotPos = rosterPositions[i];
    const targetPlayer = rosterEntries[i].player;

    if (!canFitSlot(sourcePlayer.position, targetSlotPos)) continue;

    if (targetPlayer) {
      const sourceSlotPos = rosterPositions[fromIndex];
      if (!canFitSlot(targetPlayer.position, sourceSlotPos)) continue;
    }

    targets.push(i);
  }

  return targets;
}
