import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, ListFilter, Users2, Search, X, Clock, Timer, Play, Pause } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { League, Team, Player } from "@shared/schema";

type DraftTab = "board" | "players" | "team";

const POSITION_FILTERS = ["ALL", "C", "1B", "2B", "3B", "SS", "OF", "SP", "RP", "DH", "UTIL"];
const LEVEL_FILTERS = ["ALL", "MLB", "AAA", "AA", "A+", "A", "Rookie"];

function useCountdown(targetDate: Date | null) {
  const [timeLeft, setTimeLeft] = useState<{ days: number; hours: number; minutes: number; seconds: number } | null>(null);
  const [hasReached, setHasReached] = useState(false);

  useEffect(() => {
    if (!targetDate) { setTimeLeft(null); return; }

    const update = () => {
      const now = new Date().getTime();
      const diff = targetDate.getTime() - now;
      if (diff <= 0) {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 });
        setHasReached(true);
        return;
      }
      setHasReached(false);
      setTimeLeft({
        days: Math.floor(diff / (1000 * 60 * 60 * 24)),
        hours: Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
        minutes: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)),
        seconds: Math.floor((diff % (1000 * 60)) / 1000),
      });
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [targetDate]);

  return { timeLeft, hasReached };
}

function usePickTimer(isActive: boolean, secondsPerPick: number) {
  const [pickTimeLeft, setPickTimeLeft] = useState(secondsPerPick);
  const [currentPick, setCurrentPick] = useState(1);

  useEffect(() => {
    if (!isActive) return;
    setPickTimeLeft(secondsPerPick);
  }, [isActive, secondsPerPick, currentPick]);

  useEffect(() => {
    if (!isActive) return;
    if (pickTimeLeft <= 0) return;

    const interval = setInterval(() => {
      setPickTimeLeft(prev => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [isActive, pickTimeLeft]);

  return { pickTimeLeft, currentPick, setCurrentPick };
}

function formatCountdown(t: { days: number; hours: number; minutes: number; seconds: number }) {
  if (t.days > 0) {
    return `${t.days}d ${t.hours}h ${t.minutes}m ${t.seconds}s`;
  }
  if (t.hours > 0) {
    return `${t.hours}h ${t.minutes}m ${t.seconds}s`;
  }
  return `${t.minutes}m ${String(t.seconds).padStart(2, "0")}s`;
}

function formatPickTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m > 0) return `${m}:${String(s).padStart(2, "0")}`;
  return `0:${String(s).padStart(2, "0")}`;
}

export default function DraftRoom() {
  const [, params] = useRoute("/league/:id/draft");
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const leagueId = params?.id ? parseInt(params.id) : null;
  const [activeTab, setActiveTab] = useState<DraftTab>("board");

  const [searchQuery, setSearchQuery] = useState("");
  const [positionFilter, setPositionFilter] = useState("ALL");
  const [levelFilter, setLevelFilter] = useState("ALL");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

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

  const draftDate = league?.draftDate ? new Date(league.draftDate) : null;
  const secondsPerPick = league?.secondsPerPick || 60;
  const { timeLeft, hasReached } = useCountdown(draftDate);
  const serverDraftStatus = league?.draftStatus || "pending";
  const isCommissioner = !!(user && league && league.createdBy === user.id);
  const isDraftActive = serverDraftStatus === "active";
  const isDraftPaused = serverDraftStatus === "paused";
  const { pickTimeLeft } = usePickTimer(isDraftActive, secondsPerPick);

  const draftControlMutation = useMutation({
    mutationFn: async (action: "start" | "pause" | "resume") => {
      const res = await apiRequest("POST", `/api/leagues/${leagueId}/draft-control`, {
        userId: user?.id,
        action,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId] });
    },
  });

  const { data: playersData, isLoading: playersLoading } = useQuery<{ players: Player[]; total: number }>({
    queryKey: ["/api/players", debouncedQuery, positionFilter, levelFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (debouncedQuery) params.set("q", debouncedQuery);
      if (positionFilter !== "ALL") params.set("position", positionFilter);
      if (levelFilter !== "ALL") params.set("level", levelFilter);
      params.set("limit", "100");
      const res = await fetch(`/api/players?${params}`);
      if (!res.ok) throw new Error("Failed to fetch players");
      return res.json();
    },
    enabled: activeTab === "players",
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
        const pickInRound = isEvenRound ? col + 1 : numTeams - col;
        const overall = round * numTeams + pickInRound;
        row.push({ round: round + 1, pick: pickInRound, overall, teamIndex });
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

  const positionColor = (pos: string) => {
    const colors: Record<string, string> = {
      C: "bg-yellow-600", "1B": "bg-red-600", "2B": "bg-orange-600",
      "3B": "bg-pink-600", SS: "bg-purple-600", OF: "bg-green-600",
      SP: "bg-blue-600", RP: "bg-cyan-600", DH: "bg-gray-600", UTIL: "bg-gray-600",
    };
    return colors[pos] || "bg-gray-600";
  };

  const levelColor = (level: string) => {
    const colors: Record<string, string> = {
      MLB: "text-yellow-400", AAA: "text-blue-400", AA: "text-green-400",
      "A+": "text-purple-400", A: "text-orange-400", Rookie: "text-gray-400",
    };
    return colors[level] || "text-gray-400";
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden relative">
      <div className="px-3 py-2 shrink-0 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <Button
            onClick={() => setLocation(`/league/${leagueId}`)}
            variant="ghost"
            size="sm"
            className="text-gray-400 hover:text-white -ml-1 h-8 px-2"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <span className="text-white text-sm font-semibold truncate flex-1">{league.name}</span>
        </div>

        <div className="mt-1.5">
          {isDraftActive ? (
            <div className={`flex items-center gap-2 rounded-lg px-3 py-2 border ${
              pickTimeLeft <= 10
                ? "bg-red-900/30 border-red-800/50"
                : pickTimeLeft <= 30
                  ? "bg-yellow-900/30 border-yellow-800/50"
                  : "bg-green-900/30 border-green-800/50"
            }`}>
              <Timer className={`w-4 h-4 shrink-0 ${
                pickTimeLeft <= 10 ? "text-red-400" : pickTimeLeft <= 30 ? "text-yellow-400" : "text-green-400"
              }`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                  </span>
                  <p className="text-green-400 text-[10px] font-medium uppercase tracking-wide">Draft is Live</p>
                </div>
                <p className={`text-2xl font-bold tabular-nums ${
                  pickTimeLeft <= 10 ? "text-red-400" : pickTimeLeft <= 30 ? "text-yellow-400" : "text-white"
                }`}>
                  {formatPickTime(pickTimeLeft)}
                </p>
              </div>
              {isCommissioner && (
                <Button
                  onClick={() => draftControlMutation.mutate("pause")}
                  disabled={draftControlMutation.isPending}
                  size="sm"
                  className="bg-yellow-600 hover:bg-yellow-700 text-white h-9 px-3 gap-1.5 shrink-0"
                >
                  <Pause className="w-3.5 h-3.5" />
                  Pause
                </Button>
              )}
              {!isCommissioner && (
                <div className="text-right shrink-0">
                  <p className="text-gray-400 text-[10px]">Time per pick</p>
                  <p className="text-gray-300 text-xs font-medium">{secondsPerPick}s</p>
                </div>
              )}
            </div>
          ) : isDraftPaused ? (
            <div className="flex items-center gap-2 bg-yellow-900/20 border border-yellow-800/50 rounded-lg px-3 py-2">
              <Pause className="w-4 h-4 text-yellow-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-yellow-400 text-[10px] font-medium uppercase tracking-wide">Draft Paused</p>
                <p className="text-yellow-300 text-sm font-semibold">Waiting for commissioner...</p>
              </div>
              {isCommissioner && (
                <Button
                  onClick={() => draftControlMutation.mutate("resume")}
                  disabled={draftControlMutation.isPending}
                  size="sm"
                  className="bg-green-600 hover:bg-green-700 text-white h-9 px-3 gap-1.5 shrink-0"
                >
                  <Play className="w-3.5 h-3.5" />
                  Resume
                </Button>
              )}
            </div>
          ) : !draftDate && serverDraftStatus === "pending" ? (
            <div className="flex items-center gap-2 bg-gray-800/80 rounded-lg px-3 py-2">
              <Clock className="w-4 h-4 text-gray-500 shrink-0" />
              <span className="text-gray-400 text-xs flex-1">Draft not yet scheduled</span>
              {isCommissioner && (
                <Button
                  onClick={() => draftControlMutation.mutate("start")}
                  disabled={draftControlMutation.isPending}
                  size="sm"
                  className="bg-green-600 hover:bg-green-700 text-white h-9 px-3 gap-1.5 shrink-0"
                >
                  <Play className="w-3.5 h-3.5" />
                  Start Draft
                </Button>
              )}
            </div>
          ) : timeLeft && !hasReached && serverDraftStatus === "pending" ? (
            <div className="flex items-center gap-2 bg-blue-900/30 border border-blue-800/50 rounded-lg px-3 py-2">
              <Clock className="w-4 h-4 text-blue-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-blue-400 text-[10px] font-medium uppercase tracking-wide">Draft starts in</p>
                <p className="text-white text-sm font-bold tabular-nums">{formatCountdown(timeLeft)}</p>
              </div>
              {isCommissioner ? (
                <Button
                  onClick={() => draftControlMutation.mutate("start")}
                  disabled={draftControlMutation.isPending}
                  size="sm"
                  className="bg-green-600 hover:bg-green-700 text-white h-9 px-3 gap-1.5 shrink-0"
                >
                  <Play className="w-3.5 h-3.5" />
                  Start Now
                </Button>
              ) : (
                <div className="text-right shrink-0">
                  <p className="text-gray-500 text-[10px]">
                    {draftDate?.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </p>
                  <p className="text-gray-400 text-[10px]">
                    {draftDate?.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                  </p>
                </div>
              )}
            </div>
          ) : serverDraftStatus === "pending" ? (
            <div className="flex items-center gap-2 bg-gray-800/80 rounded-lg px-3 py-2">
              <Clock className="w-4 h-4 text-gray-500 shrink-0" />
              <span className="text-gray-400 text-xs flex-1">Draft ready to begin</span>
              {isCommissioner && (
                <Button
                  onClick={() => draftControlMutation.mutate("start")}
                  disabled={draftControlMutation.isPending}
                  size="sm"
                  className="bg-green-600 hover:bg-green-700 text-white h-9 px-3 gap-1.5 shrink-0"
                >
                  <Play className="w-3.5 h-3.5" />
                  Start Draft
                </Button>
              )}
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex-1 overflow-auto hide-scrollbar relative">
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
                  <span className="text-gray-600 text-[10px] font-medium">{cell.round}.{String(cell.pick).padStart(2, "0")}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {activeTab === "players" && (
        <div className="absolute bottom-10 left-0 right-0 h-[66vh] bg-gray-900 border-t border-gray-700 rounded-t-2xl flex flex-col z-10">
          <div className="flex items-center justify-center pt-2 pb-1">
            <div className="w-10 h-1 rounded-full bg-gray-600" />
          </div>
          <h3 className="text-white font-semibold text-sm px-4 pb-2">
            Available Players
            {playersData && <span className="text-gray-500 font-normal ml-1.5">({playersData.total.toLocaleString()})</span>}
          </h3>

          <div className="px-3 pb-2 space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <Input
                placeholder="Search players..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-gray-800 border-gray-700 text-white text-sm h-9 pl-9 pr-8"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex gap-1.5 overflow-x-auto hide-scrollbar">
              {POSITION_FILTERS.map((pos) => (
                <button
                  key={pos}
                  onClick={() => setPositionFilter(pos)}
                  className={`text-[11px] font-medium px-2.5 py-1 rounded-full whitespace-nowrap transition-colors ${
                    positionFilter === pos
                      ? "bg-blue-600 text-white"
                      : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                  }`}
                >
                  {pos}
                </button>
              ))}
            </div>

            <div className="flex gap-1.5 overflow-x-auto hide-scrollbar">
              {LEVEL_FILTERS.map((level) => (
                <button
                  key={level}
                  onClick={() => setLevelFilter(level)}
                  className={`text-[11px] font-medium px-2.5 py-1 rounded-full whitespace-nowrap transition-colors ${
                    levelFilter === level
                      ? "bg-blue-600 text-white"
                      : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                  }`}
                >
                  {level}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-auto hide-scrollbar px-3 pb-3 space-y-1">
            {playersLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg sleeper-card-bg">
                  <Skeleton className="w-9 h-9 rounded-full shrink-0" />
                  <div className="flex-1">
                    <Skeleton className="h-4 w-32 mb-1" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
              ))
            ) : playersData && playersData.players.length > 0 ? (
              playersData.players.map((player) => (
                <div
                  key={player.id}
                  className="flex items-center gap-3 p-2.5 rounded-lg sleeper-card-bg"
                >
                  <div className={`w-9 h-9 rounded-full ${positionColor(player.position)} flex items-center justify-center text-white text-[10px] font-bold shrink-0`}>
                    {player.position}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-white text-sm font-medium truncate">{player.name}</p>
                      {player.jerseyNumber && (
                        <span className="text-gray-600 text-[10px]">#{player.jerseyNumber}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs">
                      <span className="text-gray-400 truncate">{player.teamAbbreviation || player.team}</span>
                      <span className="text-gray-600">·</span>
                      <span className={levelColor(player.mlbLevel || "MLB")}>{player.mlbLevel}</span>
                      {player.bats && player.throws && (
                        <>
                          <span className="text-gray-600">·</span>
                          <span className="text-gray-500">B:{player.bats} T:{player.throws}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8">
                <p className="text-gray-500 text-sm">
                  {searchQuery || positionFilter !== "ALL" || levelFilter !== "ALL"
                    ? "No players match your filters."
                    : "No players available."}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "team" && (
        <div className="absolute bottom-10 left-0 right-0 h-[66vh] bg-gray-900 border-t border-gray-700 rounded-t-2xl flex flex-col z-10">
          <div className="flex items-center justify-center pt-2 pb-1">
            <div className="w-10 h-1 rounded-full bg-gray-600" />
          </div>
          <h3 className="text-white font-semibold text-sm px-4 pb-2">My Team</h3>
          <div className="flex-1 overflow-auto hide-scrollbar px-3 pb-3">
            {myTeam ? (
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
            ) : (
              <div className="text-center py-8">
                <p className="text-gray-500 text-sm">
                  You don't have a team in this league.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      <nav className="shrink-0 border-t border-gray-800 sleeper-bg relative z-20">
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
