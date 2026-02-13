import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, ListFilter, Users2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import type { League, Team, Player } from "@shared/schema";

type DraftTab = "board" | "players" | "team";

export default function DraftRoom() {
  const [, params] = useRoute("/league/:id/draft");
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const leagueId = params?.id ? parseInt(params.id) : null;
  const [activeTab, setActiveTab] = useState<DraftTab>("board");

  const { data: league, isLoading: leagueLoading } = useQuery<League>({
    queryKey: ["/api/leagues", leagueId],
    queryFn: async () => {
      const res = await fetch(`/api/leagues/${leagueId}`);
      if (!res.ok) throw new Error("Failed to fetch league");
      return res.json();
    },
    enabled: !!leagueId,
  });

  const { data: teams } = useQuery<Team[]>({
    queryKey: ["/api/teams/league", leagueId],
    queryFn: async () => {
      const res = await fetch(`/api/teams/league/${leagueId}`);
      if (!res.ok) throw new Error("Failed to fetch teams");
      return res.json();
    },
    enabled: !!leagueId,
  });

  const { data: players } = useQuery<Player[]>({
    queryKey: ["/api/players"],
    queryFn: async () => {
      const res = await fetch("/api/players");
      if (!res.ok) throw new Error("Failed to fetch players");
      return res.json();
    },
  });

  const rosterPositions = league?.rosterPositions || [];
  const totalRounds = rosterPositions.length;
  const numTeams = league?.maxTeams || 12;
  const myTeam = teams?.find((t) => t.userId === user?.id);

  const buildDraftBoard = () => {
    const board: { round: number; pick: number; overall: number; teamIndex: number }[][] = [];
    for (let round = 0; round < totalRounds; round++) {
      const row: { round: number; pick: number; overall: number; teamIndex: number }[] = [];
      for (let col = 0; col < numTeams; col++) {
        const isEvenRound = round % 2 === 0;
        const teamIndex = isEvenRound ? col : numTeams - 1 - col;
        const overall = round * numTeams + col + 1;
        row.push({ round: round + 1, pick: col + 1, overall, teamIndex });
      }
      board.push(row);
    }
    return board;
  };

  const board = buildDraftBoard();

  if (leagueLoading) {
    return (
      <div className="px-4 py-6">
        <Skeleton className="h-8 w-48 mb-4" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }

  if (!league) {
    return (
      <div className="px-4 py-6 text-center">
        <p className="text-gray-400">League not found</p>
        <Button onClick={() => setLocation("/teams")} variant="ghost" className="mt-4 text-blue-400">
          Back to Teams
        </Button>
      </div>
    );
  }

  const CELL_W = 84;
  const CELL_H = 56;
  const GAP = 4;
  const gridWidth = numTeams * (CELL_W + GAP);

  const draftNavItems: { key: DraftTab; label: string; icon: typeof ListFilter }[] = [
    { key: "board", label: "Board", icon: ListFilter },
    { key: "players", label: "Players", icon: ListFilter },
    { key: "team", label: "My Team", icon: Users2 },
  ];

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <div className="px-3 py-3 flex items-center gap-2 shrink-0 border-b border-gray-800">
        <Button
          onClick={() => setLocation(`/league/${leagueId}`)}
          variant="ghost"
          size="sm"
          className="text-gray-400 hover:text-white -ml-1 h-8 px-2"
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <span className="text-white text-sm font-semibold truncate">{league.name}</span>
      </div>

      <div className="flex-1 overflow-auto">
        {activeTab === "board" && (
          <div style={{ minWidth: gridWidth }} className="p-3">
            <div className="flex gap-1 mb-1">
              {Array.from({ length: numTeams }).map((_, i) => (
                <div
                  key={i}
                  style={{ width: CELL_W }}
                  className="text-center text-[10px] text-gray-500 font-medium truncate px-0.5"
                >
                  {teams?.[i]?.name || `Team ${i + 1}`}
                </div>
              ))}
            </div>

            {board.map((row, roundIndex) => (
              <div key={roundIndex} className="flex gap-1 mb-1">
                {row.map((cell) => (
                  <div
                    key={cell.overall}
                    style={{ width: CELL_W, height: CELL_H }}
                    className="rounded-lg border border-gray-700 bg-gray-800/60 flex flex-col items-center justify-center shrink-0 hover:border-gray-500 transition-colors"
                  >
                    <span className="text-gray-600 text-[10px] font-medium">{cell.overall}</span>
                    <span className="text-gray-700 text-[9px] mt-0.5">{rosterPositions[roundIndex] || ""}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {activeTab === "players" && (
          <div className="p-3 space-y-1.5">
            {players && players.length > 0 ? (
              players.map((player) => (
                <div
                  key={player.id}
                  className="flex items-center gap-3 p-3 rounded-lg sleeper-card-bg"
                >
                  <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-gray-400 text-xs font-bold shrink-0">
                    {player.position?.charAt(0) || "?"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">{player.name}</p>
                    <p className="text-gray-500 text-xs">{player.position} — {player.team}</p>
                  </div>
                  <Badge className="bg-gray-700 text-gray-400 text-[10px] shrink-0">Available</Badge>
                </div>
              ))
            ) : (
              <Card className="gradient-card rounded-xl p-5 border-0">
                <p className="text-gray-500 text-sm text-center py-6">
                  No players available yet. Players will appear here once the draft begins.
                </p>
              </Card>
            )}
          </div>
        )}

        {activeTab === "team" && (
          <div className="p-3">
            {myTeam ? (
              <Card className="gradient-card rounded-xl p-5 border-0">
                <h3 className="text-white font-semibold mb-3">{myTeam.name}</h3>
                <div className="space-y-1.5">
                  {rosterPositions.map((pos, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-3 p-2.5 rounded-lg sleeper-card-bg"
                    >
                      <span className="text-[11px] font-bold w-10 text-center py-1 rounded bg-gray-700 text-gray-300 shrink-0">
                        {pos}
                      </span>
                      <div className="flex-1 border-l border-gray-700 pl-3">
                        <p className="text-gray-500 text-sm italic">Empty</p>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            ) : (
              <Card className="gradient-card rounded-xl p-5 border-0">
                <p className="text-gray-500 text-sm text-center py-6">
                  You don't have a team in this league.
                </p>
              </Card>
            )}
          </div>
        )}
      </div>

      <nav className="shrink-0 border-t border-gray-800 sleeper-bg">
        <div className="flex">
          {draftNavItems.map((item) => (
            <button
              key={item.key}
              onClick={() => setActiveTab(item.key)}
              className={`flex-1 py-3 text-center text-xs font-medium transition-colors ${
                activeTab === item.key
                  ? "text-blue-400 border-t-2 border-blue-400"
                  : "text-gray-500 hover:text-gray-300"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
