import type { Player } from "@shared/schema";

function canFitSlot(playerPosition: string, slotPosition: string): boolean {
  if (slotPosition === "BN" || slotPosition === "IL") return true;
  if (slotPosition === "UTIL") {
    return !["SP", "RP"].includes(playerPosition);
  }
  if (slotPosition === "OF") {
    return ["OF", "LF", "CF", "RF"].includes(playerPosition);
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

    if (!["SP", "RP"].includes(player.position)) {
      const utilIndex = rosterPositions.findIndex(
        (slot, i) => assigned[i] === null && slot === "UTIL"
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
