import type { Response } from "express";

type DraftEventType = "pick" | "draft-status" | "teams-update" | "league-settings";

interface DraftEvent {
  type: DraftEventType;
  leagueId: number;
  data?: unknown;
}

const leagueClients = new Map<number, Set<Response>>();

export function addClient(leagueId: number, res: Response): void {
  if (!leagueClients.has(leagueId)) {
    leagueClients.set(leagueId, new Set());
  }
  leagueClients.get(leagueId)!.add(res);

  res.on("close", () => {
    const clients = leagueClients.get(leagueId);
    if (clients) {
      clients.delete(res);
      if (clients.size === 0) {
        leagueClients.delete(leagueId);
      }
    }
  });
}

export function broadcastDraftEvent(leagueId: number, type: DraftEventType, data?: unknown): void {
  const clients = leagueClients.get(leagueId);
  if (!clients || clients.size === 0) return;

  const event: DraftEvent = { type, leagueId, data };
  const payload = `data: ${JSON.stringify(event)}\n\n`;

  const clientArray = Array.from(clients);
  for (const client of clientArray) {
    try {
      client.write(payload);
    } catch {
      clients.delete(client);
    }
  }
}

export function getClientCount(leagueId: number): number {
  return leagueClients.get(leagueId)?.size || 0;
}
