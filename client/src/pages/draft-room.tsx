import { useQuery } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import type { League, Team } from "@shared/schema";

export default function DraftRoom() {
  const [, params] = useRoute("/league/:id/draft");
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const leagueId = params?.id ? parseInt(params.id) : null;

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

  const rosterPositions = league?.rosterPositions || [];
  const totalRounds = rosterPositions.length;
  const numTeams = teams?.length || league?.maxTeams || 12;

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

  const CELL_SIZE = 72;
  const GAP = 4;
  const ROUND_LABEL_W = 36;
  const gridWidth = ROUND_LABEL_W + numTeams * (CELL_SIZE + GAP);

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
        <div style={{ minWidth: gridWidth }} className="p-3">
          <div className="flex gap-1 mb-1" style={{ paddingLeft: ROUND_LABEL_W + GAP }}>
            {Array.from({ length: numTeams }).map((_, i) => (
              <div
                key={i}
                style={{ width: CELL_SIZE }}
                className="text-center text-[10px] text-gray-500 font-medium truncate px-0.5"
              >
                {teams?.[i]?.name || `Team ${i + 1}`}
              </div>
            ))}
          </div>

          {board.map((row, roundIndex) => (
            <div key={roundIndex} className="flex items-center gap-1 mb-1">
              <div
                style={{ width: ROUND_LABEL_W }}
                className="text-[10px] text-gray-500 font-bold text-right pr-1 shrink-0"
              >
                R{roundIndex + 1}
              </div>
              {row.map((cell) => (
                <div
                  key={cell.overall}
                  style={{ width: CELL_SIZE, height: CELL_SIZE }}
                  className="rounded-lg border border-gray-700 bg-gray-800/60 flex flex-col items-center justify-center shrink-0 hover:border-gray-500 transition-colors"
                >
                  <span className="text-gray-600 text-[10px] font-medium">{cell.overall}</span>
                  <span className="text-gray-700 text-[9px] mt-0.5">{rosterPositions[roundIndex] || ""}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
