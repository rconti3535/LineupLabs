import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useInfiniteQuery, useMutation } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, ListFilter, Users2, Search, X, Clock, Timer, Play, Pause, UserPlus, Trophy, AlertTriangle, Bot, Settings } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { League, Team, Player, DraftPick, PlayerAdp } from "@shared/schema";
import { assignPlayersToRoster } from "@/lib/roster-utils";

type DraftTab = "board" | "players" | "team";

const POSITION_FILTERS = ["ALL", "C", "1B", "2B", "3B", "SS", "OF", "INF", "SP", "RP", "DH", "UT"];
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

function usePickTimer(isActive: boolean, secondsPerPick: number, draftPickStartedAt: string | null) {
  const [pickTimeLeft, setPickTimeLeft] = useState(secondsPerPick);

  useEffect(() => {
    if (!isActive || !draftPickStartedAt) {
      setPickTimeLeft(secondsPerPick);
      return;
    }

    const update = () => {
      const startedAt = new Date(draftPickStartedAt).getTime();
      const elapsed = (Date.now() - startedAt) / 1000;
      const remaining = Math.max(0, secondsPerPick - elapsed);
      setPickTimeLeft(Math.ceil(remaining));
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [isActive, secondsPerPick, draftPickStartedAt]);

  return { pickTimeLeft };
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
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatPickLabel(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return s > 0 ? `${m}m ${s}s` : `${m}m`;
  }
  const h = seconds / 3600;
  return h === 1 ? "1 hour" : `${h} hours`;
}

export default function DraftRoom() {
  const [, params] = useRoute("/league/:id/draft");
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const leagueId = params?.id ? parseInt(params.id) : null;
  const [activeTab, setActiveTab] = useState<DraftTab>("board");
  const [commissionerAssignMode, setCommissionerAssignMode] = useState(false);
  const [selectedCellOverall, setSelectedCellOverall] = useState<number | null>(null);
  const [showTeamWarning, setShowTeamWarning] = useState(false);
  const [playerPanelDragY, setPlayerPanelDragY] = useState(0);
  const playerDragRef = useRef<{ startY: number; currentY: number } | null>(null);
  const [teamPanelDragY, setTeamPanelDragY] = useState(0);
  const teamDragRef = useRef<{ startY: number; currentY: number } | null>(null);

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
    refetchInterval: 5000,
  });

  const { data: rawTeams } = useQuery<Team[]>({
    queryKey: ["/api/teams/league", leagueId],
    queryFn: async () => {
      const res = await fetch(`/api/teams/league/${leagueId}`);
      if (!res.ok) throw new Error("Failed to fetch teams");
      return res.json();
    },
    enabled: !!leagueId,
  });

  const teams = rawTeams ? [...rawTeams].sort((a, b) => (a.draftPosition || 999) - (b.draftPosition || 999)) : undefined;

  const { data: draftPicks = [] } = useQuery<DraftPick[]>({
    queryKey: ["/api/leagues", leagueId, "draft-picks"],
    queryFn: async () => {
      const res = await fetch(`/api/leagues/${leagueId}/draft-picks`);
      if (!res.ok) throw new Error("Failed to fetch draft picks");
      return res.json();
    },
    enabled: !!leagueId,
    refetchInterval: league?.draftStatus === "active" ? 3000 : false,
  });

  const { data: draftedPlayerIds = [] } = useQuery<number[]>({
    queryKey: ["/api/leagues", leagueId, "drafted-player-ids"],
    queryFn: async () => {
      const res = await fetch(`/api/leagues/${leagueId}/drafted-player-ids`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!leagueId,
    refetchInterval: league?.draftStatus === "active" ? 3000 : false,
  });

  const draftDate = league?.draftDate ? new Date(league.draftDate) : null;
  const secondsPerPick = league?.secondsPerPick || 60;
  const { timeLeft, hasReached } = useCountdown(draftDate);
  const serverDraftStatus = league?.draftStatus || "pending";
  const isCommissioner = !!(user && league && league.createdBy === user.id);
  const isDraftActive = serverDraftStatus === "active";
  const isDraftPaused = serverDraftStatus === "paused";
  const isDraftCompleted = serverDraftStatus === "completed";
  const rosterPositions = league?.rosterPositions || [];
  const totalRounds = league?.maxRosterSize || rosterPositions.length;
  const configuredTeams = league?.maxTeams || league?.numberOfTeams || 12;
  const actualTeams = teams?.length || 0;
  const numTeams = isDraftActive || isDraftPaused || isDraftCompleted ? actualTeams || configuredTeams : configuredTeams;
  const myTeam = teams?.find((t) => t.userId === user?.id);

  const nextOverall = draftPicks.length + 1;
  const currentRound = Math.ceil(nextOverall / numTeams);
  const currentPickInRound = ((nextOverall - 1) % numTeams) + 1;
  const isEvenRound = currentRound % 2 === 1;
  const currentTeamIndex = isEvenRound ? currentPickInRound - 1 : numTeams - currentPickInRound;
  const currentPickingTeam = teams?.[currentTeamIndex];
  const isMyTurn = isDraftActive && currentPickingTeam && myTeam && currentPickingTeam.id === myTeam.id;

  const { pickTimeLeft } = usePickTimer(isDraftActive, secondsPerPick, league?.draftPickStartedAt || null);

  const autoPickSentRef = useRef(false);
  useEffect(() => {
    if (pickTimeLeft > 0) {
      autoPickSentRef.current = false;
    }
    if (pickTimeLeft === 0 && isDraftActive && isCommissioner && !autoPickSentRef.current) {
      autoPickSentRef.current = true;
      apiRequest("POST", `/api/leagues/${leagueId}/auto-pick`, { userId: user?.id })
        .then(() => {
          queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "draft-picks"] });
          queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "drafted-player-ids"] });
          queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId] });
        })
        .catch(() => {});
    }
  }, [pickTimeLeft, isDraftActive, isCommissioner]);

  const picksByOverall = new Map<number, DraftPick>();
  draftPicks.forEach(p => picksByOverall.set(p.overallPick, p));

  const draftControlMutation = useMutation({
    mutationFn: async ({ action, fillWithCpu }: { action: "start" | "pause" | "resume"; fillWithCpu?: boolean }) => {
      const res = await apiRequest("POST", `/api/leagues/${leagueId}/draft-control`, {
        userId: user?.id,
        action,
        fillWithCpu,
      });
      return res.json();
    },
    onSuccess: (updatedLeague: any) => {
      queryClient.setQueryData(["/api/leagues", leagueId], updatedLeague);
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId] });
      queryClient.invalidateQueries({ queryKey: ["/api/teams/league", leagueId] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "standings"] });
      setShowTeamWarning(false);
    },
  });

  const targetTeamCount = league?.maxTeams || league?.numberOfTeams || 12;
  const currentTeamCount = teams?.length || 0;
  const teamsShort = targetTeamCount - currentTeamCount;
  const hasEnoughTeams = currentTeamCount >= targetTeamCount;

  const handleStartDraft = () => {
    if (!hasEnoughTeams && serverDraftStatus === "pending") {
      setShowTeamWarning(true);
    } else {
      draftControlMutation.mutate({ action: "start" });
    }
  };

  const draftPlayerMutation = useMutation({
    mutationFn: async (playerId: number) => {
      const res = await apiRequest("POST", `/api/leagues/${leagueId}/draft-picks`, {
        userId: user?.id,
        playerId,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "draft-picks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "drafted-player-ids"] });
    },
  });

  const commissionerAssignMutation = useMutation({
    mutationFn: async (playerId: number) => {
      const res = await apiRequest("POST", `/api/leagues/${leagueId}/commissioner-pick`, {
        commissionerId: user?.id,
        playerId,
        targetOverall: selectedCellOverall,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "draft-picks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "drafted-player-ids"] });
      setCommissionerAssignMode(false);
      setSelectedCellOverall(null);
    },
  });

  const PAGE_SIZE = 100;
  const {
    data: playersInfinite,
    isLoading: playersLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery<{ players: Player[]; total: number }>({
    queryKey: ["/api/players", debouncedQuery, positionFilter, levelFilter, league?.type, league?.scoringFormat],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams();
      if (debouncedQuery) params.set("q", debouncedQuery);
      if (positionFilter !== "ALL") params.set("position", positionFilter);
      if (levelFilter !== "ALL") params.set("level", levelFilter);
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String(pageParam));
      params.set("adpType", league?.type || "Redraft");
      params.set("adpScoring", league?.scoringFormat || "Roto");
      params.set("adpSeason", String(new Date().getFullYear()));
      const res = await fetch(`/api/players?${params}`);
      if (!res.ok) throw new Error("Failed to fetch players");
      return res.json();
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((sum, p) => sum + p.players.length, 0);
      return loaded < lastPage.total ? loaded : undefined;
    },
    enabled: (activeTab === "players" || commissionerAssignMode) && !!league,
  });

  const allFetchedPlayers = playersInfinite?.pages.flatMap(p => p.players) || [];
  const playersTotal = playersInfinite?.pages[0]?.total ?? 0;

  const { data: adpData } = useQuery<{ adpRecords: PlayerAdp[]; total: number }>({
    queryKey: ["/api/adp", league?.type || "Redraft", league?.scoringFormat || "Roto"],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("type", league?.type || "Redraft");
      params.set("scoring", league?.scoringFormat || "Roto");
      params.set("limit", "10000");
      const res = await fetch(`/api/adp?${params}`);
      if (!res.ok) throw new Error("Failed to fetch ADP");
      return res.json();
    },
    enabled: (activeTab === "players" || commissionerAssignMode) && !!league,
    staleTime: 0,
  });

  const adpMap = new Map<number, number>();
  adpData?.adpRecords?.forEach(a => adpMap.set(a.playerId, parseFloat(String(a.adp))));

  const draftedPlayerIdsSet = new Set(draftedPlayerIds);
  const availablePlayers = allFetchedPlayers.filter(p => !draftedPlayerIdsSet.has(p.id));
  const availableTotal = Math.max(0, playersTotal - draftedPlayerIds.length);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const handlePlayersScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el || !hasNextPage || isFetchingNextPage) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 200) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const draftPickPlayerIds = draftPicks.map(p => p.playerId);
  const sortedPickIds = [...draftPickPlayerIds].sort((a, b) => a - b);
  const pickIdsKey = sortedPickIds.join(",");
  const { data: allPlayers } = useQuery<Player[]>({
    queryKey: ["/api/players/by-ids", pickIdsKey],
    queryFn: async () => {
      if (sortedPickIds.length === 0) return [];
      const results = await Promise.all(
        sortedPickIds.map(async (id) => {
          const res = await fetch(`/api/players/${id}`);
          if (!res.ok) return null;
          return res.json();
        })
      );
      return results.filter(Boolean) as Player[];
    },
    enabled: sortedPickIds.length > 0,
  });

  const playerMap = new Map<number, Player>();
  allPlayers?.forEach(p => playerMap.set(p.id, p));

  const myPicks = draftPicks.filter(p => myTeam && p.teamId === myTeam.id);
  const myDraftedPlayers = myPicks.map(p => playerMap.get(p.playerId)).filter(Boolean) as Player[];
  const rosterAssignment = assignPlayersToRoster(rosterPositions, myDraftedPlayers);

  const canDraftPosition = (playerPos: string): boolean => {
    if (!rosterPositions.length) return true;
    const isBestBallDraft = league?.type === "Best Ball";
    const maxRoster = league?.maxRosterSize || rosterPositions.length;
    if (isBestBallDraft) {
      return myDraftedPlayers.length < maxRoster;
    }
    const INF_POS = ["1B", "2B", "3B", "SS"];
    const filledSlots = new Set<number>();
    for (const tp of myDraftedPlayers) {
      const idx = rosterPositions.findIndex((slot, i) => {
        if (filledSlots.has(i)) return false;
        if (slot === tp.position) return true;
        if (slot === "OF" && ["OF", "LF", "CF", "RF"].includes(tp.position)) return true;
        if (slot === "INF" && INF_POS.includes(tp.position)) return true;
        return false;
      });
      if (idx !== -1) filledSlots.add(idx);
      else {
        if (!["SP", "RP"].includes(tp.position)) {
          const utilIdx = rosterPositions.findIndex((s, i) => !filledSlots.has(i) && s === "UT");
          if (utilIdx !== -1) filledSlots.add(utilIdx);
          else {
            const bnIdx = rosterPositions.findIndex((s, i) => !filledSlots.has(i) && s === "BN");
            if (bnIdx !== -1) filledSlots.add(bnIdx);
          }
        } else {
          const pIdx = rosterPositions.findIndex((s, i) => !filledSlots.has(i) && s === "P");
          if (pIdx !== -1) filledSlots.add(pIdx);
          else {
            const bnIdx = rosterPositions.findIndex((s, i) => !filledSlots.has(i) && s === "BN");
            if (bnIdx !== -1) filledSlots.add(bnIdx);
          }
        }
      }
    }
    for (let i = 0; i < rosterPositions.length; i++) {
      if (filledSlots.has(i)) continue;
      const slot = rosterPositions[i];
      if (slot === "BN" || slot === "IL") return true;
      if (slot === "UT" && !["SP", "RP"].includes(playerPos)) return true;
      if (slot === "P" && ["SP", "RP"].includes(playerPos)) return true;
      if (slot === "OF" && ["OF", "LF", "CF", "RF"].includes(playerPos)) return true;
      if (slot === "INF" && INF_POS.includes(playerPos)) return true;
      if (slot === playerPos) return true;
    }
    if (myDraftedPlayers.length >= maxRoster) return false;
    return false;
  };

  const buildDraftBoard = () => {
    const board: { round: number; pick: number; overall: number; teamIndex: number }[][] = [];
    for (let round = 0; round < totalRounds; round++) {
      const row: { round: number; pick: number; overall: number; teamIndex: number }[] = [];
      for (let col = 0; col < numTeams; col++) {
        const isEven = round % 2 === 0;
        const teamIndex = isEven ? col : numTeams - 1 - col;
        const pickInRound = isEven ? col + 1 : numTeams - col;
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
      C: "bg-yellow-600", INF: "bg-purple-600", "1B": "bg-red-600", "2B": "bg-orange-600",
      "3B": "bg-pink-600", SS: "bg-purple-600", OF: "bg-green-600",
      SP: "bg-blue-600", RP: "bg-cyan-600", DH: "bg-gray-600", UT: "bg-gray-600", P: "bg-indigo-600",
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
                  <p className="text-green-400 text-[10px] font-medium uppercase tracking-wide">
                    {isMyTurn ? "Your Pick!" : `${currentPickingTeam?.isCpu ? "🤖 " : ""}${currentPickingTeam?.name || "..."} is picking`}
                  </p>
                </div>
                <p className={`text-2xl font-bold tabular-nums ${
                  pickTimeLeft <= 10 ? "text-red-400" : pickTimeLeft <= 30 ? "text-yellow-400" : "text-white"
                }`}>
                  {formatPickTime(pickTimeLeft)}
                </p>
              </div>
              {isCommissioner && (
                <Button
                  onClick={() => draftControlMutation.mutate({ action: "pause" })}
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
                  <p className="text-gray-400 text-[10px]">Round {currentRound}, Pick {currentPickInRound}</p>
                  <p className="text-gray-300 text-xs font-medium">#{nextOverall} overall</p>
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
                  onClick={() => draftControlMutation.mutate({ action: "resume" })}
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
                  onClick={handleStartDraft}
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
                  onClick={handleStartDraft}
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
                  onClick={handleStartDraft}
                  disabled={draftControlMutation.isPending}
                  size="sm"
                  className="bg-green-600 hover:bg-green-700 text-white h-9 px-3 gap-1.5 shrink-0"
                >
                  <Play className="w-3.5 h-3.5" />
                  Start Draft
                </Button>
              )}
            </div>
          ) : isDraftCompleted ? (
            <div className="flex items-center gap-3 bg-gradient-to-r from-yellow-900/60 to-yellow-800/40 border border-yellow-600/50 rounded-lg px-4 py-3">
              <Trophy className="w-5 h-5 text-yellow-400 shrink-0" />
              <div className="flex-1">
                <p className="text-yellow-400 text-sm font-bold">Draft is Completed!</p>
                <p className="text-yellow-500/70 text-[11px]">All {totalRounds * numTeams} picks have been made</p>
              </div>
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
                className={`text-center text-[10px] font-medium truncate px-0.5 ${
                  isDraftActive && currentTeamIndex === i ? "text-green-400" : "text-gray-500"
                }`}
              >
                {teams?.[i]?.isCpu ? "🤖 " : ""}{teams?.[i]?.name || `Team${i + 1}`}
              </div>
            ))}
          </div>

          {board.map((row, roundIndex) => (
            <div key={roundIndex} className="flex gap-1 mb-1">
              {row.map((cell) => {
                const pick = picksByOverall.get(cell.overall);
                const pickedPlayer = pick ? playerMap.get(pick.playerId) : null;
                const isCurrentPick = isDraftActive && cell.overall === nextOverall;
                const isMyTeamCell = myTeam && teams?.[cell.teamIndex]?.id === myTeam.id;
                const isSelected = selectedCellOverall === cell.overall;
                const canCommissionerAssign = isCommissioner && (isDraftActive || isDraftPaused);

                return (
                  <div
                    key={cell.overall}
                    style={{ width: CELL_W, height: CELL_H }}
                    className={`rounded-lg border flex flex-col items-center justify-center shrink-0 transition-all relative group ${
                      isSelected
                        ? "border-yellow-400 bg-yellow-900/40 ring-1 ring-yellow-400/50 shadow-lg shadow-yellow-400/20"
                        : isCurrentPick
                          ? "border-green-400 bg-green-900/40 ring-1 ring-green-400/50 shadow-lg shadow-green-400/20"
                          : pick
                            ? "border-gray-600 bg-gray-700/60"
                            : "border-gray-700 bg-gray-800/60 hover:border-gray-500"
                    } ${canCommissionerAssign ? "cursor-pointer" : ""}`}
                    onClick={() => {
                      if (canCommissionerAssign) {
                        if (isSelected) {
                          setSelectedCellOverall(null);
                          setCommissionerAssignMode(false);
                        } else {
                          setSelectedCellOverall(cell.overall);
                          setCommissionerAssignMode(true);
                        }
                      }
                    }}
                  >
                    {pickedPlayer ? (
                      <>
                        <span className={`text-[9px] font-bold px-1 rounded ${positionColor(pickedPlayer.position)} text-white`}>
                          {pickedPlayer.position}
                        </span>
                        <span className="text-white text-[10px] font-medium truncate w-full text-center px-1 leading-tight">
                          {pickedPlayer.lastName || pickedPlayer.name.split(" ").pop()}
                        </span>
                        <span className="text-gray-500 text-[8px]">{pickedPlayer.teamAbbreviation}</span>
                      </>
                    ) : isCurrentPick ? (
                      <>
                        <span className="text-green-400 text-[10px] font-bold animate-pulse">ON CLOCK</span>
                        <span className="text-green-400/70 text-[9px]">{cell.round}.{String(cell.pick).padStart(2, "0")}</span>
                      </>
                    ) : (
                      <span className="text-gray-600 text-[10px] font-medium">{cell.round}.{String(cell.pick).padStart(2, "0")}</span>
                    )}
                    {canCommissionerAssign && !isSelected && (
                      <div className="absolute inset-0 rounded-lg bg-yellow-900/70 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <UserPlus className="w-3 h-3 text-yellow-400 mb-0.5" />
                        <span className="text-yellow-400 text-[8px] font-bold">ASSIGN</span>
                      </div>
                    )}
                    {isSelected && (
                      <div className="absolute inset-0 rounded-lg bg-yellow-900/70 flex flex-col items-center justify-center">
                        <UserPlus className="w-3 h-3 text-yellow-400 mb-0.5" />
                        <span className="text-yellow-400 text-[8px] font-bold">ASSIGN</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {(activeTab === "players" || commissionerAssignMode) && (
        <div
          className="absolute bottom-10 left-0 right-0 bg-gray-900 border-t border-gray-700 rounded-t-2xl flex flex-col z-10 transition-transform duration-200 ease-out"
          style={{
            height: "66vh",
            transform: `translateY(${playerPanelDragY}px)`,
            opacity: playerPanelDragY > 0 ? Math.max(0.3, 1 - playerPanelDragY / 300) : 1,
          }}
        >
          <div
            className="flex items-center justify-center pt-2 pb-1 cursor-grab active:cursor-grabbing touch-none"
            onTouchStart={(e) => {
              const touch = e.touches[0];
              playerDragRef.current = { startY: touch.clientY, currentY: touch.clientY };
              setPlayerPanelDragY(0);
            }}
            onTouchMove={(e) => {
              if (!playerDragRef.current) return;
              const touch = e.touches[0];
              playerDragRef.current.currentY = touch.clientY;
              const dy = touch.clientY - playerDragRef.current.startY;
              if (dy > 0) setPlayerPanelDragY(dy);
            }}
            onTouchEnd={() => {
              if (!playerDragRef.current) return;
              const dy = playerDragRef.current.currentY - playerDragRef.current.startY;
              playerDragRef.current = null;
              if (dy > 80) {
                setActiveTab("board");
                setCommissionerAssignMode(false);
                setSelectedCellOverall(null);
              }
              setPlayerPanelDragY(0);
            }}
            onMouseDown={(e) => {
              playerDragRef.current = { startY: e.clientY, currentY: e.clientY };
              setPlayerPanelDragY(0);
              const onMove = (ev: MouseEvent) => {
                if (!playerDragRef.current) return;
                playerDragRef.current.currentY = ev.clientY;
                const dy = ev.clientY - playerDragRef.current.startY;
                if (dy > 0) setPlayerPanelDragY(dy);
              };
              const onUp = () => {
                if (playerDragRef.current) {
                  const dy = playerDragRef.current.currentY - playerDragRef.current.startY;
                  playerDragRef.current = null;
                  if (dy > 80) {
                    setActiveTab("board");
                    setCommissionerAssignMode(false);
                    setSelectedCellOverall(null);
                  }
                  setPlayerPanelDragY(0);
                }
                window.removeEventListener("mousemove", onMove);
                window.removeEventListener("mouseup", onUp);
              };
              window.addEventListener("mousemove", onMove);
              window.addEventListener("mouseup", onUp);
            }}
          >
            <div className="w-10 h-1 rounded-full bg-gray-600" />
          </div>
          <div className="flex items-center justify-between px-4 pb-2">
            <h3 className="text-white font-semibold text-sm">
              {commissionerAssignMode && selectedCellOverall ? (
                <>
                  <span className="text-yellow-400">Assign Player</span>
                  <span className="text-gray-500 font-normal ml-1.5">Pick {Math.ceil(selectedCellOverall / numTeams)}.{String(((selectedCellOverall - 1) % numTeams) + 1).padStart(2, "0")}</span>
                </>
              ) : (
                <>
                  Available Players
                  {playersInfinite && <span className="text-gray-500 font-normal ml-1.5">({availableTotal.toLocaleString()})</span>}
                </>
              )}
            </h3>
            {commissionerAssignMode && (
              <button
                onClick={() => { setCommissionerAssignMode(false); setSelectedCellOverall(null); }}
                className="text-gray-400 hover:text-white p-1"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

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

          <div
            ref={scrollContainerRef}
            onScroll={handlePlayersScroll}
            className="flex-1 overflow-auto hide-scrollbar px-3 pb-3 space-y-1"
          >
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
            ) : availablePlayers.length > 0 ? (
              availablePlayers.map((player) => (
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
                      <span className="text-gray-600">&middot;</span>
                      <span className={levelColor(player.mlbLevel || "MLB")}>{player.mlbLevel}</span>
                      {player.bats && player.throws && (
                        <>
                          <span className="text-gray-600">&middot;</span>
                          <span className="text-gray-500">B:{player.bats} T:{player.throws}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0 mr-1">
                    <p className="text-[10px] text-gray-500 uppercase">ADP</p>
                    <p className="text-sm font-semibold text-gray-300">
                      {adpMap.has(player.id) ? adpMap.get(player.id)!.toFixed(1) : "9999.0"}
                    </p>
                  </div>
                  {commissionerAssignMode ? (
                    <Button
                      onClick={() => commissionerAssignMutation.mutate(player.id)}
                      disabled={commissionerAssignMutation.isPending}
                      size="sm"
                      className="bg-yellow-600 hover:bg-yellow-700 text-white h-8 px-3 text-xs shrink-0"
                    >
                      Assign
                    </Button>
                  ) : isMyTurn ? (
                    canDraftPosition(player.position) ? (
                      <Button
                        onClick={() => draftPlayerMutation.mutate(player.id)}
                        disabled={draftPlayerMutation.isPending}
                        size="sm"
                        className="bg-green-600 hover:bg-green-700 text-white h-8 px-3 text-xs shrink-0"
                      >
                        Draft
                      </Button>
                    ) : (
                      <span className="text-[10px] text-red-400 font-medium shrink-0 text-right leading-tight w-14">
                        No slot
                      </span>
                    )
                  ) : null}
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
            {isFetchingNextPage && (
              <div className="flex justify-center py-3">
                <div className="text-gray-500 text-xs">Loading more players...</div>
              </div>
            )}
            {!playersLoading && availablePlayers.length > 0 && hasNextPage && !isFetchingNextPage && (
              <div className="flex justify-center py-2">
                <p className="text-gray-600 text-[10px]">Scroll for more</p>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "team" && (
        <div
          className="absolute bottom-10 left-0 right-0 bg-gray-900 border-t border-gray-700 rounded-t-2xl flex flex-col z-10 transition-transform duration-200 ease-out"
          style={{
            height: "66vh",
            transform: `translateY(${teamPanelDragY}px)`,
            opacity: teamPanelDragY > 0 ? Math.max(0.3, 1 - teamPanelDragY / 300) : 1,
          }}
        >
          <div
            className="flex items-center justify-center pt-2 pb-1 cursor-grab active:cursor-grabbing touch-none"
            onTouchStart={(e) => {
              const touch = e.touches[0];
              teamDragRef.current = { startY: touch.clientY, currentY: touch.clientY };
              setTeamPanelDragY(0);
            }}
            onTouchMove={(e) => {
              if (!teamDragRef.current) return;
              const touch = e.touches[0];
              teamDragRef.current.currentY = touch.clientY;
              const dy = touch.clientY - teamDragRef.current.startY;
              if (dy > 0) setTeamPanelDragY(dy);
            }}
            onTouchEnd={() => {
              if (!teamDragRef.current) return;
              const dy = teamDragRef.current.currentY - teamDragRef.current.startY;
              teamDragRef.current = null;
              if (dy > 80) {
                setActiveTab("board");
              }
              setTeamPanelDragY(0);
            }}
            onMouseDown={(e) => {
              teamDragRef.current = { startY: e.clientY, currentY: e.clientY };
              setTeamPanelDragY(0);
              const onMove = (ev: MouseEvent) => {
                if (!teamDragRef.current) return;
                teamDragRef.current.currentY = ev.clientY;
                const dy = ev.clientY - teamDragRef.current.startY;
                if (dy > 0) setTeamPanelDragY(dy);
              };
              const onUp = () => {
                if (teamDragRef.current) {
                  const dy = teamDragRef.current.currentY - teamDragRef.current.startY;
                  teamDragRef.current = null;
                  if (dy > 80) {
                    setActiveTab("board");
                  }
                  setTeamPanelDragY(0);
                }
                window.removeEventListener("mousemove", onMove);
                window.removeEventListener("mouseup", onUp);
              };
              window.addEventListener("mousemove", onMove);
              window.addEventListener("mouseup", onUp);
            }}
          >
            <div className="w-10 h-1 rounded-full bg-gray-600" />
          </div>
          <h3 className="text-white font-semibold text-sm px-4 pb-2">My Team</h3>
          <div className="flex-1 overflow-auto hide-scrollbar px-3 pb-3">
            {myTeam ? (() => {
              const isBestBallDraft = league?.type === "Best Ball";
              const STAT_COL = "w-[42px] text-center text-[11px] shrink-0";

              if (isBestBallDraft) {
                const INF_POS = ["1B", "2B", "3B", "SS"];
                const OF_POS = ["OF", "LF", "CF", "RF", "DH", "UT"];
                const BB_SECTIONS = [
                  { label: "Catchers", positions: ["C"], isHitting: true },
                  { label: "Infielders", positions: INF_POS, isHitting: true },
                  { label: "Outfielders", positions: OF_POS, isHitting: true },
                  { label: "Starting Pitchers", positions: ["SP"], isHitting: false },
                  { label: "Relief Pitchers", positions: ["RP"], isHitting: false },
                ];

                return (
                  <div className="space-y-4">
                    {BB_SECTIONS.map(section => {
                      const players = myDraftedPlayers.filter(p => section.positions.includes(p.position));
                      return (
                        <div key={section.label}>
                          <p className="text-gray-400 text-[11px] uppercase font-bold tracking-wider mb-2">
                            {section.label} {players.length > 0 && <span className="text-gray-600">({players.length})</span>}
                          </p>
                          {players.length === 0 ? (
                            <p className="text-gray-600 text-xs italic pl-1 pb-1">No players drafted yet</p>
                          ) : (
                            <div className="overflow-x-auto hide-scrollbar -mx-1 px-1" style={{ WebkitOverflowScrolling: "touch" }}>
                              <table className="w-full" style={{ minWidth: "460px" }}>
                                <thead>
                                  <tr className="border-b border-gray-700">
                                    <th className="text-left text-[10px] text-gray-500 font-semibold uppercase pb-1.5 w-9 pl-1">Pos</th>
                                    <th className="text-left text-[10px] text-gray-500 font-semibold uppercase pb-1.5 w-[140px]">Player</th>
                                    {section.isHitting ? (
                                      <>
                                        <th className={`${STAT_COL} text-gray-400 font-semibold pb-1.5`}>R</th>
                                        <th className={`${STAT_COL} text-gray-400 font-semibold pb-1.5`}>HR</th>
                                        <th className={`${STAT_COL} text-gray-400 font-semibold pb-1.5`}>RBI</th>
                                        <th className={`${STAT_COL} text-gray-400 font-semibold pb-1.5`}>SB</th>
                                        <th className={`${STAT_COL} text-gray-400 font-semibold pb-1.5`}>AVG</th>
                                      </>
                                    ) : (
                                      <>
                                        <th className={`${STAT_COL} text-gray-400 font-semibold pb-1.5`}>W</th>
                                        <th className={`${STAT_COL} text-gray-400 font-semibold pb-1.5`}>SV</th>
                                        <th className={`${STAT_COL} text-gray-400 font-semibold pb-1.5`}>K</th>
                                        <th className={`${STAT_COL} text-gray-400 font-semibold pb-1.5`}>ERA</th>
                                        <th className={`${STAT_COL} text-gray-400 font-semibold pb-1.5`}>WHIP</th>
                                      </>
                                    )}
                                  </tr>
                                </thead>
                                <tbody>
                                  {players.map((p, pi) => (
                                    <tr key={pi} className="border-b border-gray-800/50">
                                      <td className="py-1.5 pl-1">
                                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-700 text-gray-300">{p.position}</span>
                                      </td>
                                      <td className="py-1.5 pr-2">
                                        <div>
                                          <p className="text-white text-xs font-medium truncate max-w-[130px]">{p.name}</p>
                                          <p className="text-gray-500 text-[10px]">{p.position} — {p.teamAbbreviation || p.team}</p>
                                        </div>
                                      </td>
                                      {section.isHitting ? (
                                        <>
                                          <td className={`${STAT_COL} text-gray-300`}>{(p as any).statR ?? "-"}</td>
                                          <td className={`${STAT_COL} text-gray-300`}>{(p as any).statHR ?? "-"}</td>
                                          <td className={`${STAT_COL} text-gray-300`}>{(p as any).statRBI ?? "-"}</td>
                                          <td className={`${STAT_COL} text-gray-300`}>{(p as any).statSB ?? "-"}</td>
                                          <td className={`${STAT_COL} text-gray-300`}>{(p as any).statAVG ?? "-"}</td>
                                        </>
                                      ) : (
                                        <>
                                          <td className={`${STAT_COL} text-gray-300`}>{(p as any).statW ?? "-"}</td>
                                          <td className={`${STAT_COL} text-gray-300`}>{(p as any).statSV ?? "-"}</td>
                                          <td className={`${STAT_COL} text-gray-300`}>{(p as any).statK ?? "-"}</td>
                                          <td className={`${STAT_COL} text-gray-300`}>{(p as any).statERA ?? "-"}</td>
                                          <td className={`${STAT_COL} text-gray-300`}>{(p as any).statWHIP ?? "-"}</td>
                                        </>
                                      )}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              }

              const isPitcherSlot = (s: string) => s === "SP" || s === "RP";
              const posSlots: { pos: string; index: number }[] = [];
              const pitchSlots: { pos: string; index: number }[] = [];
              const benchSlots: { pos: string; index: number }[] = [];
              rosterPositions.forEach((pos, index) => {
                if (pos === "BN" || pos === "IL") benchSlots.push({ pos, index });
                else if (isPitcherSlot(pos)) pitchSlots.push({ pos, index });
                else posSlots.push({ pos, index });
              });

              return (
                <div className="space-y-4">
                  {posSlots.length > 0 && (
                    <div>
                      <p className="text-gray-400 text-[11px] uppercase font-bold tracking-wider mb-2">Position Players</p>
                      <div className="overflow-x-auto hide-scrollbar -mx-1 px-1" style={{ WebkitOverflowScrolling: "touch" }}>
                        <table className="w-full" style={{ minWidth: "460px" }}>
                          <thead>
                            <tr className="border-b border-gray-700">
                              <th className="text-left text-[10px] text-gray-500 font-semibold uppercase pb-1.5 w-9 pl-1">Pos</th>
                              <th className="text-left text-[10px] text-gray-500 font-semibold uppercase pb-1.5 w-[140px]">Player</th>
                              <th className={`${STAT_COL} text-gray-400 font-semibold pb-1.5`}>R</th>
                              <th className={`${STAT_COL} text-gray-400 font-semibold pb-1.5`}>HR</th>
                              <th className={`${STAT_COL} text-gray-400 font-semibold pb-1.5`}>RBI</th>
                              <th className={`${STAT_COL} text-gray-400 font-semibold pb-1.5`}>SB</th>
                              <th className={`${STAT_COL} text-gray-400 font-semibold pb-1.5`}>AVG</th>
                            </tr>
                          </thead>
                          <tbody>
                            {posSlots.map(slot => {
                              const p = rosterAssignment[slot.index] || null;
                              return (
                                <tr key={slot.index} className="border-b border-gray-800/50">
                                  <td className="py-1.5 pl-1">
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-700 text-gray-300">{slot.pos}</span>
                                  </td>
                                  <td className="py-1.5 pr-2">
                                    {p ? (
                                      <div>
                                        <p className="text-white text-xs font-medium truncate max-w-[130px]">{p.name}</p>
                                        <p className="text-gray-500 text-[10px]">{p.position} — {p.teamAbbreviation || p.team}</p>
                                      </div>
                                    ) : (
                                      <p className="text-gray-600 text-xs italic">Empty</p>
                                    )}
                                  </td>
                                  <td className={`${STAT_COL} text-gray-300`}>{p ? p.statR : "-"}</td>
                                  <td className={`${STAT_COL} text-gray-300`}>{p ? p.statHR : "-"}</td>
                                  <td className={`${STAT_COL} text-gray-300`}>{p ? p.statRBI : "-"}</td>
                                  <td className={`${STAT_COL} text-gray-300`}>{p ? p.statSB : "-"}</td>
                                  <td className={`${STAT_COL} text-gray-300`}>{p ? p.statAVG : "-"}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {pitchSlots.length > 0 && (
                    <div>
                      <p className="text-gray-400 text-[11px] uppercase font-bold tracking-wider mb-2">Pitchers</p>
                      <div className="overflow-x-auto hide-scrollbar -mx-1 px-1" style={{ WebkitOverflowScrolling: "touch" }}>
                        <table className="w-full" style={{ minWidth: "460px" }}>
                          <thead>
                            <tr className="border-b border-gray-700">
                              <th className="text-left text-[10px] text-gray-500 font-semibold uppercase pb-1.5 w-9 pl-1">Pos</th>
                              <th className="text-left text-[10px] text-gray-500 font-semibold uppercase pb-1.5 w-[140px]">Player</th>
                              <th className={`${STAT_COL} text-gray-400 font-semibold pb-1.5`}>W</th>
                              <th className={`${STAT_COL} text-gray-400 font-semibold pb-1.5`}>SV</th>
                              <th className={`${STAT_COL} text-gray-400 font-semibold pb-1.5`}>K</th>
                              <th className={`${STAT_COL} text-gray-400 font-semibold pb-1.5`}>ERA</th>
                              <th className={`${STAT_COL} text-gray-400 font-semibold pb-1.5`}>WHIP</th>
                            </tr>
                          </thead>
                          <tbody>
                            {pitchSlots.map(slot => {
                              const p = rosterAssignment[slot.index] || null;
                              return (
                                <tr key={slot.index} className="border-b border-gray-800/50">
                                  <td className="py-1.5 pl-1">
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-700 text-gray-300">{slot.pos}</span>
                                  </td>
                                  <td className="py-1.5 pr-2">
                                    {p ? (
                                      <div>
                                        <p className="text-white text-xs font-medium truncate max-w-[130px]">{p.name}</p>
                                        <p className="text-gray-500 text-[10px]">{p.position} — {p.teamAbbreviation || p.team}</p>
                                      </div>
                                    ) : (
                                      <p className="text-gray-600 text-xs italic">Empty</p>
                                    )}
                                  </td>
                                  <td className={`${STAT_COL} text-gray-300`}>{p ? p.statW : "-"}</td>
                                  <td className={`${STAT_COL} text-gray-300`}>{p ? p.statSV : "-"}</td>
                                  <td className={`${STAT_COL} text-gray-300`}>{p ? p.statK : "-"}</td>
                                  <td className={`${STAT_COL} text-gray-300`}>{p ? p.statERA : "-"}</td>
                                  <td className={`${STAT_COL} text-gray-300`}>{p ? p.statWHIP : "-"}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {benchSlots.length > 0 && (
                    <div>
                      <p className="text-gray-400 text-[11px] uppercase font-bold tracking-wider mb-2">Bench / IL</p>
                      <div className="space-y-1">
                        {benchSlots.map(slot => {
                          const p = rosterAssignment[slot.index] || null;
                          return (
                            <div key={slot.index} className="flex items-center gap-2 py-1.5">
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-700 text-gray-300 shrink-0">{slot.pos}</span>
                              {p ? (
                                <div className="min-w-0">
                                  <p className="text-white text-xs font-medium truncate">{p.name}</p>
                                  <p className="text-gray-500 text-[10px]">{p.position} — {p.teamAbbreviation || p.team}</p>
                                </div>
                              ) : (
                                <p className="text-gray-600 text-xs italic">Empty</p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })() : (
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
              onClick={() => { setActiveTab(item.key); setCommissionerAssignMode(false); setSelectedCellOverall(null); }}
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

      <Dialog open={showTeamWarning} onOpenChange={setShowTeamWarning}>
        <DialogContent className="bg-gray-900 border-gray-700 max-w-sm">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 rounded-full bg-yellow-600/20 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-yellow-400" />
              </div>
              <DialogTitle className="text-white text-lg">Not Enough Teams</DialogTitle>
            </div>
            <DialogDescription className="text-gray-400 text-sm pt-2">
              This league is set for <span className="text-white font-semibold">{targetTeamCount} teams</span>, but only <span className="text-white font-semibold">{currentTeamCount}</span> {currentTeamCount === 1 ? "has" : "have"} joined. You're short <span className="text-yellow-400 font-semibold">{teamsShort} {teamsShort === 1 ? "team" : "teams"}</span>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <Button
              onClick={() => draftControlMutation.mutate({ action: "start" })}
              disabled={draftControlMutation.isPending}
              className="w-full bg-green-600 hover:bg-green-700 text-white gap-2 h-11"
            >
              <Play className="w-4 h-4" />
              {draftControlMutation.isPending ? "Starting..." : `Start Draft with ${currentTeamCount} ${currentTeamCount === 1 ? "Team" : "Teams"}`}
            </Button>
            <Button
              onClick={() => draftControlMutation.mutate({ action: "start", fillWithCpu: true })}
              disabled={draftControlMutation.isPending}
              variant="outline"
              className="w-full border-gray-600 text-gray-200 hover:bg-gray-800 hover:text-white gap-2 h-11"
            >
              <Bot className="w-4 h-4" />
              {draftControlMutation.isPending ? "Starting..." : `Fill ${teamsShort} Empty ${teamsShort === 1 ? "Spot" : "Spots"} with CPU`}
            </Button>
            <Button
              onClick={() => {
                setShowTeamWarning(false);
                setLocation(`/league/${leagueId}`);
              }}
              variant="ghost"
              className="w-full text-gray-400 hover:text-white gap-2 h-9 text-xs"
            >
              <Settings className="w-4 h-4" />
              Go to Settings & Change Team Count
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
