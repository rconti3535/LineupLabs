import { storage } from "./storage";

let processingInterval: ReturnType<typeof setInterval> | null = null;

async function processExpiredWaivers(): Promise<void> {
  try {
    const expired = await storage.getExpiredWaivers();
    if (expired.length === 0) return;

    console.log(`[Waiver Processor] Processing ${expired.length} expired waiver(s)...`);

    for (const waiver of expired) {
      try {
        const claims = await storage.getClaimsForWaiver(waiver.id);

        if (claims.length === 0) {
          await storage.completeWaiver(waiver.id, "cleared");
          const player = await storage.getPlayer(waiver.playerId);
          console.log(`[Waiver Processor] Waiver cleared — ${player?.name || "Unknown"} is now a free agent (no claims)`);
          continue;
        }

        claims.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        const winningClaim = claims[0];

        const league = await storage.getLeague(waiver.leagueId);
        if (!league) {
          await storage.completeWaiver(waiver.id, "cleared");
          continue;
        }

        const rosterPositions = league.rosterPositions || [];
        const allPicks = await storage.getDraftPicksByLeague(waiver.leagueId);
        const teamPicks = allPicks.filter(p => p.teamId === winningClaim.teamId);

        if (winningClaim.dropPickId) {
          const dropPick = await storage.getDraftPickById(winningClaim.dropPickId);
          if (dropPick && dropPick.teamId === winningClaim.teamId) {
            const droppedPlayer = await storage.getPlayer(dropPick.playerId);
            const rosterSlot = dropPick.rosterSlot ?? 0;
            await storage.dropPlayerFromTeam(winningClaim.dropPickId);
            await storage.addPlayerToTeam(waiver.leagueId, winningClaim.teamId, waiver.playerId, rosterSlot);

            const claimedPlayer = await storage.getPlayer(waiver.playerId);
            console.log(`[Waiver Processor] Waiver claimed — ${claimedPlayer?.name || "Unknown"} awarded to team ${winningClaim.teamId}, dropped ${droppedPlayer?.name || "Unknown"}`);
          } else {
            await storage.completeWaiver(waiver.id, "cleared");
            console.log(`[Waiver Processor] Waiver cleared — drop pick no longer valid`);
            for (const claim of claims) {
              await storage.deleteWaiverClaim(claim.id);
            }
            continue;
          }
        } else {
          const occupiedSlots = new Set(teamPicks.map(p => p.rosterSlot).filter(s => s !== null));
          let assignedSlot: number | null = null;
          for (let i = 0; i < rosterPositions.length; i++) {
            if (occupiedSlots.has(i)) continue;
            const slotPos = rosterPositions[i];
            if (slotPos === "BN" || slotPos === "IL") {
              assignedSlot = i;
              break;
            }
          }

          if (assignedSlot !== null) {
            await storage.addPlayerToTeam(waiver.leagueId, winningClaim.teamId, waiver.playerId, assignedSlot);
            const claimedPlayer = await storage.getPlayer(waiver.playerId);
            console.log(`[Waiver Processor] Waiver claimed — ${claimedPlayer?.name || "Unknown"} awarded to team ${winningClaim.teamId} (open slot)`);
          } else {
            await storage.completeWaiver(waiver.id, "cleared");
            console.log(`[Waiver Processor] Waiver cleared — winning team has no open roster slots`);
            for (const claim of claims) {
              await storage.deleteWaiverClaim(claim.id);
            }
            continue;
          }
        }

        await storage.completeWaiver(waiver.id, "claimed");
        for (const claim of claims) {
          await storage.deleteWaiverClaim(claim.id);
        }
      } catch (err) {
        console.error(`[Waiver Processor] Error processing waiver ${waiver.id}:`, err);
      }
    }
  } catch (err) {
    console.error("[Waiver Processor] Error fetching expired waivers:", err);
  }
}

export function startWaiverProcessor(): void {
  if (processingInterval) return;
  console.log("[Waiver Processor] Started — checking every 5 minutes");
  processExpiredWaivers();
  processingInterval = setInterval(processExpiredWaivers, 5 * 60 * 1000);
}

export function stopWaiverProcessor(): void {
  if (processingInterval) {
    clearInterval(processingInterval);
    processingInterval = null;
    console.log("[Waiver Processor] Stopped");
  }
}
