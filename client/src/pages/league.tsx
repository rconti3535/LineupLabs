import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Users, Trophy, Calendar, TrendingUp, Pencil, Trash2, AlertTriangle, ArrowUpDown, Search, Plus, X, ChevronDown, Menu, Clock } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { League, Team, DraftPick, Player } from "@shared/schema";
import { assignPlayersToRosterWithPicks, getSwapTargets, type RosterEntry } from "@/lib/roster-utils";

type Tab = "roster" | "players" | "standings" | "settings";

interface StandingsData {
  standings: {
    teamId: number;
    teamName: string;
    userId: number | null;
    isCpu: boolean | null;
    categoryValues: Record<string, number>;
    categoryPoints: Record<string, number>;
    totalPoints: number;
  }[];
  hittingCategories: string[];
  pitchingCategories: string[];
  numTeams: number;
}

function formatStatValue(cat: string, value: number): string {
  const RATE_STATS = ["AVG", "OBP", "SLG", "OPS"];
  const DECIMAL_STATS = ["ERA", "WHIP", "K/9"];
  if (RATE_STATS.includes(cat)) return value === 0 ? ".000" : value.toFixed(3).replace(/^0/, "");
  if (DECIMAL_STATS.includes(cat)) return value.toFixed(2);
  if (cat === "IP") return value.toFixed(1);
  return String(Math.round(value));
}

function StandingsTab({ leagueId, league, teamsLoading, teams }: { leagueId: number; league: League; teamsLoading: boolean; teams: Team[] | undefined }) {
  const { data: standingsData, isLoading } = useQuery<StandingsData>({
    queryKey: ["/api/leagues", leagueId, "standings"],
    queryFn: async () => {
      const res = await fetch(`/api/leagues/${leagueId}/standings`);
      if (!res.ok) throw new Error("Failed to fetch standings");
      return res.json();
    },
    enabled: leagueId !== null,
  });

  const loading = teamsLoading || isLoading;

  if (loading) {
    return (
      <Card className="gradient-card rounded-xl p-5 border-0">
        <h3 className="text-white font-semibold mb-4">League Standings</h3>
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      </Card>
    );
  }

  if (!teams || teams.length === 0) {
    return (
      <Card className="gradient-card rounded-xl p-5 border-0">
        <h3 className="text-white font-semibold mb-4">League Standings</h3>
        <p className="text-gray-400 text-sm text-center py-4">No teams in this league yet</p>
      </Card>
    );
  }

  if (!standingsData) {
    return (
      <Card className="gradient-card rounded-xl p-5 border-0">
        <h3 className="text-white font-semibold mb-4">League Standings</h3>
        <p className="text-gray-400 text-sm text-center py-4">Unable to load standings</p>
      </Card>
    );
  }

  const { standings, hittingCategories, pitchingCategories } = standingsData;
  const allCats = [
    ...hittingCategories.map(c => ({ key: `h_${c}`, label: c, isHitting: true })),
    ...pitchingCategories.map(c => ({ key: `p_${c}`, label: c, isHitting: false })),
  ];

  const totalCats = hittingCategories.length + pitchingCategories.length;
  const minWidth = 140 + 48 + totalCats * 56;

  return (
    <Card className="gradient-card rounded-xl p-4 border-0">
      <h3 className="text-white font-semibold mb-3">Roto Standings</h3>
      <div className="overflow-x-auto hide-scrollbar -mx-1 px-1" style={{ WebkitOverflowScrolling: "touch" }}>
        <table className="w-full" style={{ minWidth: minWidth + "px" }}>
          <thead>
            <tr className="border-b border-gray-700">
              <th className="text-left text-[10px] text-gray-500 font-semibold uppercase pb-1.5 sticky left-0 bg-[#1a1d26] z-10 w-[140px] pl-1">Team</th>
              <th className="text-center text-[10px] text-yellow-400 font-bold uppercase pb-1.5 w-[48px]">PTS</th>
              {hittingCategories.map((cat, i) => (
                <th key={`h_${cat}`} className={`text-center text-[10px] text-blue-400 font-semibold uppercase pb-1.5 w-[56px] ${i === 0 ? "border-l border-gray-700/50" : ""}`}>{cat}</th>
              ))}
              {pitchingCategories.map((cat, i) => (
                <th key={`p_${cat}`} className={`text-center text-[10px] text-emerald-400 font-semibold uppercase pb-1.5 w-[56px] ${i === 0 ? "border-l border-gray-700/50" : ""}`}>{cat}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {standings.map((team, idx) => (
              <tr key={team.teamId} className="border-b border-gray-800/50 hover:bg-white/[0.02]">
                <td className="py-2 sticky left-0 bg-[#1a1d26] z-10 pl-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold w-5 text-center shrink-0 ${idx === 0 ? "text-yellow-400" : idx === 1 ? "text-gray-300" : idx === 2 ? "text-orange-400" : "text-gray-500"}`}>
                      {idx + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="text-white text-xs font-medium truncate">{team.teamName}</p>
                      {team.isCpu && <span className="text-[9px] text-gray-500">CPU</span>}
                    </div>
                  </div>
                </td>
                <td className="text-center py-2">
                  <p className="text-yellow-400 text-xs font-bold">{team.totalPoints.toFixed(1)}</p>
                </td>
                {hittingCategories.map((cat, i) => {
                  const val = team.categoryValues[`h_${cat}`] || 0;
                  const pts = team.categoryPoints[`h_${cat}`] || 0;
                  return (
                    <td key={`h_${cat}`} className={`text-center py-2 ${i === 0 ? "border-l border-gray-700/50" : ""}`}>
                      <p className="text-white text-[11px] font-medium leading-tight">{formatStatValue(cat, val)}</p>
                      <p className="text-gray-500 text-[9px] leading-tight">{pts.toFixed(1)}</p>
                    </td>
                  );
                })}
                {pitchingCategories.map((cat, i) => {
                  const val = team.categoryValues[`p_${cat}`] || 0;
                  const pts = team.categoryPoints[`p_${cat}`] || 0;
                  return (
                    <td key={`p_${cat}`} className={`text-center py-2 ${i === 0 ? "border-l border-gray-700/50" : ""}`}>
                      <p className="text-white text-[11px] font-medium leading-tight">{formatStatValue(cat, val)}</p>
                      <p className="text-gray-500 text-[9px] leading-tight">{pts.toFixed(1)}</p>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-4 mt-2 px-1">
        <span className="text-[9px] text-blue-400 uppercase tracking-wider font-semibold">Hitting</span>
        <span className="text-[9px] text-emerald-400 uppercase tracking-wider font-semibold">Pitching</span>
      </div>
    </Card>
  );
}

const BATTER_POSITIONS = ["All", "C", "1B", "2B", "3B", "SS", "OF", "UTIL"];
const PITCHER_POSITIONS = ["All", "SP", "RP"];

const HITTING_STAT_MAP: Record<string, { key: keyof Player; isRate?: boolean }> = {
  R: { key: "statR" }, HR: { key: "statHR" }, RBI: { key: "statRBI" }, SB: { key: "statSB" },
  AVG: { key: "statAVG", isRate: true }, H: { key: "statH" }, "2B": { key: "stat2B" }, "3B": { key: "stat3B" },
  BB: { key: "statBB" }, K: { key: "statK" }, OBP: { key: "statOBP", isRate: true },
  SLG: { key: "statSLG", isRate: true }, OPS: { key: "statOPS", isRate: true }, TB: { key: "statTB" },
  CS: { key: "statCS" }, HBP: { key: "statHBP" }, AB: { key: "statAB" }, PA: { key: "statPA" },
};

const PITCHING_STAT_MAP: Record<string, { key: keyof Player; isRate?: boolean }> = {
  W: { key: "statW" }, SV: { key: "statSV" }, ERA: { key: "statERA", isRate: true },
  WHIP: { key: "statWHIP", isRate: true }, L: { key: "statL" }, QS: { key: "statQS" },
  HLD: { key: "statHLD" }, IP: { key: "statIP", isRate: true }, SO: { key: "statSO" },
  K: { key: "statSO" }, CG: { key: "statCG" }, SHO: { key: "statSHO" }, BSV: { key: "statBSV" },
};

function AddDropRosterRow({ pick, rosterPositions, isPending, onSelect }: {
  pick: DraftPick;
  rosterPositions: string[];
  isPending: boolean;
  onSelect: (pickId: number) => void;
}) {
  const { data: player } = useQuery<Player>({
    queryKey: ["/api/players", pick.playerId],
    queryFn: async () => {
      const res = await fetch(`/api/players/${pick.playerId}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const slotLabel = pick.rosterSlot !== null && pick.rosterSlot !== undefined
    ? rosterPositions[pick.rosterSlot] || "BN"
    : "BN";

  return (
    <button
      className="w-full flex items-center gap-3 py-3 border-b border-gray-800/40 hover:bg-red-950/20 transition-colors text-left disabled:opacity-40"
      onClick={() => onSelect(pick.id)}
      disabled={isPending}
    >
      <span className="w-8 text-center text-[10px] text-gray-500 font-semibold uppercase shrink-0">{slotLabel}</span>
      {player ? (
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm font-medium truncate">{player.name}</p>
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-blue-400 font-medium">{player.position}</span>
            <span className="text-[11px] text-gray-500">{player.teamAbbreviation || player.team}</span>
          </div>
        </div>
      ) : (
        <div className="flex-1">
          <span className="text-gray-400 text-xs">Loading...</span>
        </div>
      )}
      <Trash2 className="w-4 h-4 text-red-400/60 shrink-0" />
    </button>
  );
}

function PlayersTab({ leagueId, league, user }: { leagueId: number; league: League; user: { id: number } | null }) {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [positionFilter, setPositionFilter] = useState("All");
  const [playerType, setPlayerType] = useState<"batters" | "pitchers">("batters");
  const [rosterStatus, setRosterStatus] = useState<"free_agents" | "rostered" | "all">("free_agents");
  const [statView, setStatView] = useState<"adp" | "2025stats" | "2026proj" | "2026stats">("adp");
  const [searchExpanded, setSearchExpanded] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const { data, isLoading } = useQuery<{ players: Player[]; total: number }>({
    queryKey: ["/api/leagues", leagueId, "available-players", debouncedQuery, positionFilter, playerType, rosterStatus],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (debouncedQuery) params.set("q", debouncedQuery);
      if (positionFilter !== "All") params.set("position", positionFilter);
      params.set("type", playerType);
      if (rosterStatus !== "all") params.set("status", rosterStatus);
      params.set("limit", "5000");
      const res = await fetch(`/api/leagues/${leagueId}/available-players?${params}`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const { data: myPicks } = useQuery<DraftPick[]>({
    queryKey: ["/api/leagues", leagueId, "draft-picks"],
    queryFn: async () => {
      const res = await fetch(`/api/leagues/${leagueId}/draft-picks`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const { data: leagueTeams } = useQuery<Team[]>({
    queryKey: ["/api/teams/league", leagueId],
    queryFn: async () => {
      const res = await fetch(`/api/teams/league/${leagueId}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const { data: waiverData } = useQuery<{ id: number; playerId: number; waiverExpiresAt: string }[]>({
    queryKey: ["/api/leagues", leagueId, "waivers"],
    queryFn: async () => {
      const res = await fetch(`/api/leagues/${leagueId}/waivers`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const waiverPlayerIds = new Set((waiverData || []).map(w => w.playerId));

  const userTeam = leagueTeams?.find(t => t.userId === user?.id);
  const myTeamPicks = myPicks?.filter(p => p.teamId === userTeam?.id) || [];
  const rosterPositions = league.rosterPositions || [];
  const hasOpenSlot = myTeamPicks.length < rosterPositions.length;
  const rosteredPlayerIds = new Set((myPicks || []).map(p => p.playerId));

  const [waiverClaimPlayer, setWaiverClaimPlayer] = useState<Player | null>(null);

  const claimMutation = useMutation({
    mutationFn: async ({ playerId, dropPickId }: { playerId: number; dropPickId?: number }) => {
      const res = await apiRequest("POST", `/api/leagues/${leagueId}/waiver-claim`, {
        userId: user?.id,
        playerId,
        dropPickId,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Waiver claim submitted" });
      setWaiverClaimPlayer(null);
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "waivers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "my-claims"] });
    },
    onError: (err: Error) => {
      toast({ title: err.message || "Failed to submit claim", variant: "destructive" });
    },
  });

  const addMutation = useMutation({
    mutationFn: async (playerId: number) => {
      const res = await apiRequest("POST", `/api/leagues/${leagueId}/add-player`, {
        userId: user?.id,
        playerId,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Player added to your roster" });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "available-players"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "draft-picks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "standings"] });
    },
    onError: (err: Error) => {
      toast({ title: err.message || "Failed to add player", variant: "destructive" });
    },
  });

  const dropMutation = useMutation({
    mutationFn: async (pickId: number) => {
      const res = await apiRequest("POST", `/api/leagues/${leagueId}/drop-player`, {
        userId: user?.id,
        pickId,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Player dropped — on waivers for 2 days" });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "available-players"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "draft-picks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "standings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "waivers"] });
    },
    onError: (err: Error) => {
      toast({ title: err.message || "Failed to drop player", variant: "destructive" });
    },
  });

  const addDropMutation = useMutation({
    mutationFn: async ({ addPlayerId, dropPickId }: { addPlayerId: number; dropPickId: number }) => {
      const res = await apiRequest("POST", `/api/leagues/${leagueId}/add-drop`, {
        userId: user?.id,
        addPlayerId,
        dropPickId,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Player swap successful — dropped player on waivers" });
      setAddDropPlayer(null);
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "available-players"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "draft-picks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "standings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "waivers"] });
    },
    onError: (err: Error) => {
      toast({ title: err.message || "Failed to add/drop player", variant: "destructive" });
    },
  });

  const [dropConfirm, setDropConfirm] = useState<{ pickId: number; playerName: string } | null>(null);
  const [addDropPlayer, setAddDropPlayer] = useState<Player | null>(null);


  const hittingCats = league.hittingCategories || ["R", "HR", "RBI", "SB", "AVG"];
  const pitchingCats = league.pitchingCategories || ["W", "SV", "K", "ERA", "WHIP"];
  const activeCats = playerType === "batters" ? hittingCats : pitchingCats;
  const statMap = playerType === "batters" ? HITTING_STAT_MAP : PITCHING_STAT_MAP;
  const posOptions = playerType === "batters" ? BATTER_POSITIONS : PITCHER_POSITIONS;

  type PlayerWithAdp = Player & { adpValue?: number | null };

  const getStatValue = (player: PlayerWithAdp, cat: string): string => {
    if (statView === "2026proj" || statView === "2026stats") return "-";
    const mapping = statMap[cat];
    if (!mapping) return "-";
    const raw = player[mapping.key];
    if (raw === null || raw === undefined) return "-";
    return String(raw);
  };

  const statViewLabel: Record<string, string> = {
    adp: "ADP",
    "2025stats": "2025 Stats",
    "2026proj": "2026 Proj",
    "2026stats": "2026 Stats",
  };

  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (searchExpanded && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [searchExpanded]);

  return (
    <div>
      {searchExpanded ? (
        <div className="flex items-center gap-2 mb-3">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
            <Input
              ref={searchInputRef}
              placeholder="Search players..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-9 bg-gray-800/50 border-gray-700 text-sm text-white"
            />
          </div>
          <button
            className="w-9 h-9 flex items-center justify-center text-gray-400 hover:text-white transition-colors shrink-0"
            onClick={() => { setSearchExpanded(false); setSearchQuery(""); }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 mb-3">
          <div className="flex bg-gray-800/60 rounded-lg p-0.5 shrink-0">
            <button
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${playerType === "batters" ? "bg-blue-600 text-white" : "text-gray-400 hover:text-gray-300"}`}
              onClick={() => { setPlayerType("batters"); setPositionFilter("All"); }}
            >
              Batters
            </button>
            <button
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${playerType === "pitchers" ? "bg-blue-600 text-white" : "text-gray-400 hover:text-gray-300"}`}
              onClick={() => { setPlayerType("pitchers"); setPositionFilter("All"); }}
            >
              Pitchers
            </button>
          </div>
          <Select value={positionFilter} onValueChange={(v) => setPositionFilter(v)}>
            <SelectTrigger className="w-[72px] h-9 bg-gray-800/50 border-gray-700 text-sm text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {posOptions.map(pos => (
                <SelectItem key={pos} value={pos}>{pos}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex-1" />
          <Select value={rosterStatus} onValueChange={(v: "free_agents" | "rostered" | "all") => setRosterStatus(v)}>
            <SelectTrigger className="w-9 h-9 bg-gray-800/50 border-gray-700 text-white p-0 flex items-center justify-center [&>svg:last-child]:hidden">
              <Menu className="w-4 h-4" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="free_agents">Free Agents</SelectItem>
              <SelectItem value="rostered">Rostered</SelectItem>
              <SelectItem value="all">All Players</SelectItem>
            </SelectContent>
          </Select>
          <button
            className="w-9 h-9 flex items-center justify-center text-gray-400 hover:text-white bg-gray-800/50 border border-gray-700 rounded-md transition-colors shrink-0"
            onClick={() => setSearchExpanded(true)}
          >
            <Search className="w-4 h-4" />
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded" />
          ))}
        </div>
      ) : !data || data.players.length === 0 ? (
        <p className="text-gray-400 text-sm text-center py-6">No available players found</p>
      ) : (
        <>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-gray-500">{data.total} players available</span>
            <Select value={statView} onValueChange={(v: "adp" | "2025stats" | "2026proj" | "2026stats") => setStatView(v)}>
              <SelectTrigger className="w-[110px] h-7 bg-gray-800/50 border-gray-700 text-[11px] text-white">
                <SelectValue>{statViewLabel[statView]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="adp">ADP</SelectItem>
                <SelectItem value="2025stats">2025 Stats</SelectItem>
                <SelectItem value="2026proj">2026 Proj</SelectItem>
                <SelectItem value="2026stats">2026 Stats</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="overflow-x-auto hide-scrollbar" style={{ WebkitOverflowScrolling: "touch" }}>
            <table className="w-full" style={{ minWidth: 24 + 120 + (statView === "adp" ? 56 : activeCats.length * 48) + "px" }}>
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="w-[24px]" />
                  <th className="text-left text-[10px] text-gray-500 font-semibold uppercase pb-1.5 pl-1 w-[120px]">Player</th>
                  {statView === "adp" ? (
                    <th className="text-center text-[10px] text-gray-400 font-semibold uppercase pb-1.5 w-[56px]">ADP</th>
                  ) : (
                    activeCats.map(cat => (
                      <th key={cat} className="text-center text-[10px] text-gray-400 font-semibold uppercase pb-1.5 w-[48px]">{cat}</th>
                    ))
                  )}
                </tr>
              </thead>
              <tbody>
                {(data.players as PlayerWithAdp[]).map(player => {
                  const isOnWaivers = waiverPlayerIds.has(player.id);
                  const isRostered = rosteredPlayerIds.has(player.id);
                  const plusColor = isRostered
                    ? "text-red-400 border-red-500/60 hover:bg-red-500/20"
                    : isOnWaivers
                    ? "text-yellow-400 border-yellow-500/60 hover:bg-yellow-500/20"
                    : "text-green-400 border-green-500/60 hover:bg-green-500/20";
                  return (
                  <tr key={player.id} className="border-b border-gray-800/40 hover:bg-white/[0.02]">
                    <td className="py-1.5">
                      <button
                        className={`w-6 h-6 rounded-md border flex items-center justify-center transition-colors disabled:opacity-30 ${plusColor}`}
                        onClick={() => {
                          if (isRostered) return;
                          if (isOnWaivers) {
                            if (hasOpenSlot) {
                              claimMutation.mutate({ playerId: player.id });
                            } else {
                              setWaiverClaimPlayer(player);
                            }
                            return;
                          } else if (hasOpenSlot) {
                            addMutation.mutate(player.id);
                          } else {
                            setAddDropPlayer(player);
                          }
                        }}
                        disabled={isRostered || addMutation.isPending || claimMutation.isPending}
                        title={isRostered ? "Already rostered" : isOnWaivers ? "On waivers — submit claim" : "Add to roster"}
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </td>
                    <td className="py-1.5 pl-1">
                      <p className="text-white text-xs font-medium truncate max-w-[110px]">{player.name}</p>
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-blue-400 font-medium">{player.position}</span>
                        <span className="text-[10px] text-gray-500">{player.teamAbbreviation || player.team}</span>
                      </div>
                    </td>
                    {statView === "adp" ? (
                      <td className="text-center py-1.5">
                        <span className="text-white text-[11px]">{player.adpValue && player.adpValue < 9999 ? player.adpValue : "-"}</span>
                      </td>
                    ) : (
                      activeCats.map(cat => (
                        <td key={cat} className="text-center py-1.5">
                          <span className="text-white text-[11px]">{getStatValue(player, cat)}</span>
                        </td>
                      ))
                    )}
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

        </>
      )}

      <Dialog open={!!dropConfirm} onOpenChange={() => setDropConfirm(null)}>
        <DialogContent className="bg-gray-900 border-gray-700">
          <DialogHeader>
            <DialogTitle className="text-white">Drop Player</DialogTitle>
            <DialogDescription>Are you sure you want to drop this player? They will be placed on waivers for 2 days before becoming a free agent.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDropConfirm(null)} className="text-gray-400">Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (dropConfirm) {
                  dropMutation.mutate(dropConfirm.pickId);
                  setDropConfirm(null);
                }
              }}
            >
              Drop Player
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {addDropPlayer && (
        <div className="fixed inset-0 z-50 bg-gray-950 flex flex-col">
          <div className="flex items-center gap-3 p-4 border-b border-gray-800">
            <button onClick={() => setAddDropPlayer(null)} className="text-gray-400 hover:text-white">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex-1">
              <h2 className="text-white font-semibold text-sm">Add / Drop</h2>
              <p className="text-gray-400 text-xs">Select a player to drop</p>
            </div>
          </div>

          <div className="p-4 border-b border-gray-800 bg-green-950/30">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] text-green-400 font-semibold uppercase tracking-wider">Adding</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-green-600/20 flex items-center justify-center shrink-0">
                <Plus className="w-4 h-4 text-green-400" />
              </div>
              <div>
                <p className="text-white text-sm font-medium">{addDropPlayer.name}</p>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-blue-400 font-medium">{addDropPlayer.position}</span>
                  <span className="text-[11px] text-gray-500">{addDropPlayer.teamAbbreviation || addDropPlayer.team}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="p-4 pb-2">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] text-red-400 font-semibold uppercase tracking-wider">Select a player to drop</span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto hide-scrollbar px-4 pb-20">
            {myTeamPicks.map((pick) => (
              <AddDropRosterRow
                key={pick.id}
                pick={pick}
                rosterPositions={rosterPositions}
                isPending={addDropMutation.isPending}
                onSelect={(pickId) => {
                  addDropMutation.mutate({ addPlayerId: addDropPlayer.id, dropPickId: pickId });
                }}
              />
            ))}
          </div>
        </div>
      )}

      {waiverClaimPlayer && (
        <div className="fixed inset-0 z-50 bg-gray-950 flex flex-col">
          <div className="flex items-center gap-3 p-4 border-b border-gray-800">
            <button onClick={() => setWaiverClaimPlayer(null)} className="text-gray-400 hover:text-white">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex-1">
              <h2 className="text-white font-semibold text-sm">Waiver Claim</h2>
              <p className="text-gray-400 text-xs">Select a player to drop</p>
            </div>
          </div>

          <div className="p-4 border-b border-gray-800 bg-yellow-950/30">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] text-yellow-400 font-semibold uppercase tracking-wider">Claiming (Waiver)</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-yellow-600/20 flex items-center justify-center shrink-0">
                <Plus className="w-4 h-4 text-yellow-400" />
              </div>
              <div>
                <p className="text-white text-sm font-medium">{waiverClaimPlayer.name}</p>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-blue-400 font-medium">{waiverClaimPlayer.position}</span>
                  <span className="text-[11px] text-gray-500">{waiverClaimPlayer.teamAbbreviation || waiverClaimPlayer.team}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="p-4 pb-2">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] text-red-400 font-semibold uppercase tracking-wider">Select a player to drop</span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto hide-scrollbar px-4 pb-20">
            {myTeamPicks.map((pick) => (
              <AddDropRosterRow
                key={pick.id}
                pick={pick}
                rosterPositions={rosterPositions}
                isPending={claimMutation.isPending}
                onSelect={(pickId) => {
                  claimMutation.mutate({ playerId: waiverClaimPlayer.id, dropPickId: pickId });
                }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PlayerName({ playerId }: { playerId: number }) {
  const { data: player } = useQuery<Player>({
    queryKey: ["/api/players", playerId],
    queryFn: async () => {
      const res = await fetch(`/api/players/${playerId}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });
  if (!player) return <span className="text-gray-400 text-xs">Loading...</span>;
  return (
    <div className="min-w-0">
      <p className="text-white text-xs font-medium truncate">{player.name}</p>
      <span className="text-[10px] text-blue-400">{player.position}</span>
    </div>
  );
}

export default function LeaguePage() {
  const [, params] = useRoute("/league/:id");
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const leagueId = params?.id ? parseInt(params.id) : null;
  const [activeTab, setActiveTab] = useState<Tab>("roster");
  const [isEditing, setIsEditing] = useState(false);
  const [editMaxTeams, setEditMaxTeams] = useState("");
  const [editScoringFormat, setEditScoringFormat] = useState("");
  const [editType, setEditType] = useState("");
  const [editStatus, setEditStatus] = useState("");
  const [isEditingRoster, setIsEditingRoster] = useState(false);
  const [editRosterPositions, setEditRosterPositions] = useState<string[]>([]);
  const [editRosterCounts, setEditRosterCounts] = useState<Record<string, number>>({});
  const [isEditingDraft, setIsEditingDraft] = useState(false);
  const [editDraftType, setEditDraftType] = useState("");
  const [editDraftDate, setEditDraftDate] = useState("");
  const [editSecondsPerPick, setEditSecondsPerPick] = useState("");
  const [editDraftOrder, setEditDraftOrder] = useState("");
  const [isEditingScoring, setIsEditingScoring] = useState(false);
  const [editHittingCategories, setEditHittingCategories] = useState<string[]>([]);
  const [editPitchingCategories, setEditPitchingCategories] = useState<string[]>([]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [selectedSwapIndex, setSelectedSwapIndex] = useState<number | null>(null);
  const [swapTargets, setSwapTargets] = useState<number[]>([]);
  const { toast } = useToast();

  const { data: league, isLoading: leagueLoading } = useQuery<League>({
    queryKey: ["/api/leagues", leagueId],
    queryFn: async () => {
      const res = await fetch(`/api/leagues/${leagueId}`);
      if (!res.ok) throw new Error("Failed to fetch league");
      return res.json();
    },
    enabled: leagueId !== null,
  });

  const { data: teams, isLoading: teamsLoading } = useQuery<Team[]>({
    queryKey: ["/api/teams/league", leagueId],
    queryFn: async () => {
      const res = await fetch(`/api/teams/league/${leagueId}`);
      if (!res.ok) throw new Error("Failed to fetch teams");
      return res.json();
    },
    enabled: leagueId !== null,
  });

  const myTeam = teams?.find((t) => t.userId === user?.id);
  const isCommissioner = league?.createdBy === user?.id;
  const leagueHittingCats = league?.hittingCategories || ["R", "HR", "RBI", "SB", "AVG"];
  const leaguePitchingCats = league?.pitchingCategories || ["W", "SV", "K", "ERA", "WHIP"];

  const { data: draftPicks = [] } = useQuery<DraftPick[]>({
    queryKey: ["/api/leagues", leagueId, "draft-picks"],
    queryFn: async () => {
      const res = await fetch(`/api/leagues/${leagueId}/draft-picks`);
      if (!res.ok) throw new Error("Failed to fetch draft picks");
      return res.json();
    },
    enabled: leagueId !== null,
  });

  const myPicks = draftPicks.filter(p => myTeam && p.teamId === myTeam.id);

  const myPickPlayerIds = myPicks.map(p => p.playerId).sort((a, b) => a - b);
  const myPickIdsKey = myPickPlayerIds.join(",");

  const { data: myRosteredPlayers = [] } = useQuery<Player[]>({
    queryKey: ["/api/players/roster", leagueId, myTeam?.id, myPickIdsKey],
    queryFn: async () => {
      if (myPickPlayerIds.length === 0) return [];
      const results = await Promise.all(
        myPickPlayerIds.map(async (id) => {
          const res = await fetch(`/api/players/${id}`);
          if (!res.ok) return null;
          return res.json();
        })
      );
      return results.filter(Boolean) as Player[];
    },
    enabled: myPickPlayerIds.length > 0,
  });

  const { data: myClaimsData } = useQuery<any[]>({
    queryKey: ["/api/leagues", leagueId, "my-claims"],
    queryFn: async () => {
      if (!user?.id) return [];
      const res = await fetch(`/api/leagues/${leagueId}/my-claims?userId=${user.id}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!user?.id && leagueId !== null,
  });

  const initRosterMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/leagues/${leagueId}/init-roster-slots`, { userId: user?.id });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "draft-picks"] });
    },
  });

  const rosterSlots = league?.rosterPositions || [];
  const rosterEntries = assignPlayersToRosterWithPicks(rosterSlots, myRosteredPlayers, myPicks);

  const needsInit = league?.draftStatus === "completed" && myPicks.length > 0 && !myPicks.some(p => p.rosterSlot !== null && p.rosterSlot !== undefined);

  useEffect(() => {
    if (needsInit && !initRosterMutation.isPending) {
      initRosterMutation.mutate();
    }
  }, [needsInit]);

  const handleSwapSelect = (index: number) => {
    if (selectedSwapIndex === null) {
      const targets = getSwapTargets(rosterEntries, index, rosterSlots);
      if (targets.length === 0) {
        toast({ title: "No valid swap targets", description: "This player cannot be moved to any other slot.", variant: "destructive" });
        return;
      }
      setSelectedSwapIndex(index);
      setSwapTargets(targets);
    } else if (selectedSwapIndex === index) {
      setSelectedSwapIndex(null);
      setSwapTargets([]);
    } else if (swapTargets.includes(index)) {
      const entryA = rosterEntries[selectedSwapIndex];
      const entryB = rosterEntries[index];
      swapMutation.mutate({
        pickIdA: entryA.pickId!,
        slotA: selectedSwapIndex,
        pickIdB: entryB.pickId,
        slotB: index,
      });
    } else {
      setSelectedSwapIndex(null);
      setSwapTargets([]);
    }
  };

  const swapMutation = useMutation({
    mutationFn: async (data: { pickIdA: number; slotA: number; pickIdB: number | null; slotB: number }) => {
      await apiRequest("POST", `/api/leagues/${leagueId}/roster-swap`, {
        userId: user?.id,
        ...data,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "draft-picks"] });
      setSelectedSwapIndex(null);
      setSwapTargets([]);
      toast({ title: "Roster updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Swap failed", description: error.message, variant: "destructive" });
      setSelectedSwapIndex(null);
      setSwapTargets([]);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/leagues/${leagueId}`, { userId: user?.id });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues/public"] });
      queryClient.invalidateQueries({ queryKey: ["/api/teams/user"] });
      setLocation("/teams");
      setTimeout(() => {
        toast({
          title: "League deleted",
          description: `"${league?.name}" has been permanently deleted. ADP data was preserved.`,
        });
      }, 100);
    },
    onError: () => {
      toast({ title: "Failed to delete league", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await apiRequest("PATCH", `/api/leagues/${leagueId}`, {
        ...data,
        userId: user?.id,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues/public"] });
      setIsEditing(false);
      toast({ title: "Settings updated" });
    },
    onError: () => {
      toast({ title: "Failed to update settings", variant: "destructive" });
    },
  });

  const startEditing = () => {
    if (!league) return;
    setEditMaxTeams(String(league.maxTeams));
    setEditScoringFormat(league.scoringFormat || "Roto");
    setEditType(league.type || "Redraft");
    setEditStatus(league.isPublic ? "Public" : "Private");
    setIsEditing(true);
  };

  const saveSettings = () => {
    updateMutation.mutate({
      maxTeams: parseInt(editMaxTeams),
      type: editType,
      status: editStatus,
      isPublic: editStatus === "Public",
    });
  };

  const ALL_HITTING_STATS = ["R", "HR", "RBI", "SB", "AVG", "H", "2B", "3B", "BB", "K", "OBP", "SLG", "OPS", "TB", "CS", "HBP"];
  const ALL_PITCHING_STATS = ["W", "SV", "K", "ERA", "WHIP", "L", "QS", "HLD", "IP", "SO", "BB", "HR", "CG", "SHO", "BSV", "K/9"];

  const STAT_LABELS: Record<string, string> = {
    R: "Runs", HR: "Home Runs", RBI: "RBI", SB: "Stolen Bases", AVG: "Batting Average",
    H: "Hits", "2B": "Doubles", "3B": "Triples", BB: "Walks", K: "Strikeouts",
    OBP: "On-Base %", SLG: "Slugging %", OPS: "OBP+SLG", TB: "Total Bases",
    CS: "Caught Stealing", HBP: "Hit By Pitch",
    W: "Wins", SV: "Saves", ERA: "ERA", WHIP: "WHIP", L: "Losses",
    QS: "Quality Starts", HLD: "Holds", IP: "Innings Pitched", SO: "Strikeouts",
    CG: "Complete Games", SHO: "Shutouts", BSV: "Blown Saves", "K/9": "K per 9",
  };

  const startEditingScoring = () => {
    if (!league) return;
    setEditScoringFormat(league.scoringFormat || "Roto");
    setEditHittingCategories(league.hittingCategories || ["R", "HR", "RBI", "SB", "AVG"]);
    setEditPitchingCategories(league.pitchingCategories || ["W", "SV", "K", "ERA", "WHIP"]);
    setIsEditingScoring(true);
  };

  const saveScoringSettings = () => {
    updateMutation.mutate({
      scoringFormat: editScoringFormat,
      hittingCategories: editHittingCategories,
      pitchingCategories: editPitchingCategories,
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "standings"] });
      },
    });
    setIsEditingScoring(false);
  };

  const toggleHittingStat = (stat: string) => {
    setEditHittingCategories(prev =>
      prev.includes(stat) ? prev.filter(s => s !== stat) : [...prev, stat]
    );
  };

  const togglePitchingStat = (stat: string) => {
    setEditPitchingCategories(prev =>
      prev.includes(stat) ? prev.filter(s => s !== stat) : [...prev, stat]
    );
  };

  const positionsToCountsMap = (positions: string[]): Record<string, number> => {
    const counts: Record<string, number> = {};
    ALL_POSITIONS.forEach(pos => counts[pos] = 0);
    positions.forEach(pos => { counts[pos] = (counts[pos] || 0) + 1; });
    return counts;
  };

  const countsToPositionsArray = (counts: Record<string, number>): string[] => {
    const result: string[] = [];
    ALL_POSITIONS.forEach(pos => {
      for (let i = 0; i < (counts[pos] || 0); i++) {
        result.push(pos);
      }
    });
    return result;
  };

  const startEditingRoster = () => {
    if (!league) return;
    const positions = league.rosterPositions || ["C", "1B", "2B", "3B", "SS", "OF", "OF", "OF", "UTIL", "SP", "SP", "RP", "RP", "BN", "BN", "IL"];
    setEditRosterPositions(positions);
    setEditRosterCounts(positionsToCountsMap(positions));
    setIsEditingRoster(true);
  };

  const saveRosterSettings = () => {
    const positions = countsToPositionsArray(editRosterCounts);
    updateMutation.mutate({ rosterPositions: positions });
    setIsEditingRoster(false);
  };

  const updatePositionCount = (pos: string, delta: number) => {
    setEditRosterCounts(prev => {
      const newCount = Math.max(0, (prev[pos] || 0) + delta);
      return { ...prev, [pos]: newCount };
    });
  };

  const startEditingDraft = () => {
    if (!league) return;
    setEditDraftType(league.draftType || "Snake");
    setEditDraftDate(league.draftDate || "");
    setEditSecondsPerPick(String(league.secondsPerPick || 60));
    setEditDraftOrder(league.draftOrder || "Random");
    setIsEditingDraft(true);
  };

  const saveDraftSettings = () => {
    updateMutation.mutate({
      draftType: editDraftType,
      draftDate: editDraftDate || null,
      secondsPerPick: parseInt(editSecondsPerPick),
      draftOrder: editDraftOrder,
    });
    setIsEditingDraft(false);
  };

  const ALL_POSITIONS = ["C", "1B", "2B", "3B", "SS", "OF", "UTIL", "SP", "RP", "BN", "IL", "DH"];

  if (leagueLoading) {
    return (
      <div className="px-4 py-6">
        <Skeleton className="h-8 w-48 mb-4" />
        <Skeleton className="h-10 w-full rounded-lg mb-4" />
        <Skeleton className="h-60 w-full rounded-xl" />
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

  const tabs: { key: Tab; label: string }[] = [
    { key: "roster", label: "Roster" },
    { key: "players", label: "Players" },
    { key: "standings", label: "Standings" },
    { key: "settings", label: "Settings" },
  ];

  return (
    <div className="px-4 py-6">
      <Button
        onClick={() => setLocation("/teams")}
        variant="ghost"
        className="text-gray-400 hover:text-white mb-3 -ml-2"
      >
        <ArrowLeft className="w-4 h-4 mr-2" />
        Back to Teams
      </Button>

      <div className="mb-4">
        <div className="flex items-center gap-2 mb-1">
          <h1 className="text-lg font-bold text-white">{league.name}</h1>
          {isCommissioner && (
            <Badge className="text-[10px] px-1.5 py-0 shrink-0 bg-yellow-600 text-white">
              Commish
            </Badge>
          )}
        </div>
        {league.description && (
          <p className="text-gray-400 text-sm">{league.description}</p>
        )}
      </div>

      <div className="flex border-b border-gray-700 mb-4">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 py-2.5 text-sm font-medium text-center transition-colors ${
              activeTab === tab.key
                ? "text-blue-400 border-b-2 border-blue-400"
                : "text-gray-400 hover:text-gray-300"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "roster" && (
        <div>
          {league.draftStatus !== "completed" ? (
            <Card className="gradient-card rounded-xl p-4 border-0 mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-600/20 flex items-center justify-center shrink-0">
                  <Calendar className="w-5 h-5 text-blue-400" />
                </div>
                {league.draftDate ? (
                  <div className="flex-1">
                    <p className="text-white font-semibold text-sm">Draft Scheduled</p>
                    <p className="text-gray-400 text-xs">
                      {league.draftType || "Snake"} Draft — {new Date(league.draftDate).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })} at {new Date(league.draftDate).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                    </p>
                    <Button
                      onClick={() => setLocation(`/league/${leagueId}/draft`)}
                      className="mt-2 bg-blue-600 hover:bg-blue-700 text-white text-xs h-8 px-4"
                      size="sm"
                    >
                      Join Draft Room
                    </Button>
                  </div>
                ) : (
                  <div>
                    <p className="text-white font-semibold text-sm">Draft Not Scheduled</p>
                    <p className="text-gray-400 text-xs">The commissioner has not scheduled a draft yet. Check back later or review settings.</p>
                  </div>
                )}
              </div>
            </Card>
          ) : null}

          {myClaimsData && myClaimsData.length > 0 && (
            <div className="mb-4">
              <Select>
                <SelectTrigger className="w-full bg-yellow-950/20 border-yellow-900/30 text-yellow-400 hover:bg-yellow-950/30 transition-colors h-10 px-4 rounded-xl">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    <span className="text-sm font-semibold">Pending Waiver Claims</span>
                    <Badge variant="outline" className="ml-auto bg-yellow-400/20 text-yellow-400 border-yellow-400/30 text-[10px] h-5 px-1.5">
                      {myClaimsData.length}
                    </Badge>
                  </div>
                </SelectTrigger>
                <SelectContent className="bg-gray-900 border-gray-800 p-2 max-h-[300px] overflow-y-auto">
                  <div className="space-y-2">
                    {myClaimsData.map((claim: any) => (
                      <div key={claim.id} className="flex items-center gap-3 bg-yellow-950/20 rounded-lg p-2.5 border border-yellow-900/30">
                        <div className="w-7 h-7 rounded-full bg-yellow-600/20 flex items-center justify-center shrink-0">
                          <Plus className="w-3.5 h-3.5 text-yellow-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-xs font-medium truncate">{claim.player?.name || "Unknown"}</p>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-blue-400">{claim.player?.position}</span>
                            <span className="text-[10px] text-gray-500">{claim.player?.teamAbbreviation}</span>
                            {claim.dropPlayer && (
                              <>
                                <span className="text-[10px] text-gray-600">•</span>
                                <span className="text-[10px] text-red-400">Drop: {claim.dropPlayer.name}</span>
                              </>
                            )}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-[10px] text-gray-400">Expires</p>
                          <p className="text-[10px] text-yellow-400 font-medium">
                            {claim.waiver?.waiverExpiresAt
                              ? new Date(claim.waiver.waiverExpiresAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                              : "—"}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </SelectContent>
              </Select>
            </div>
          )}

          {myTeam ? (() => {
            const isPitcherSlot = (s: string) => s === "SP" || s === "RP";
            const posEntries = rosterEntries.filter(e => !isPitcherSlot(e.slotPos) && e.slotPos !== "BN" && e.slotPos !== "IL");
            const pitchEntries = rosterEntries.filter(e => isPitcherSlot(e.slotPos));
            const benchEntries = rosterEntries.filter(e => e.slotPos === "BN" || e.slotPos === "IL");
            const isDraftCompleted = league.draftStatus === "completed";

            const STAT_COL = "w-[42px] text-center text-[11px] shrink-0";

            const getRowClass = (idx: number) => {
              if (selectedSwapIndex === idx) return "border-b border-blue-500/50 bg-blue-900/30";
              if (swapTargets.includes(idx)) return "border-b border-green-500/30 bg-green-900/20 cursor-pointer";
              return "border-b border-gray-800/50";
            };

            const renderSwapButton = (entry: RosterEntry) => {
              if (!isDraftCompleted || !entry.player) return null;
              const idx = entry.slotIndex;
              const isSelected = selectedSwapIndex === idx;
              const isTarget = swapTargets.includes(idx);
              return (
                <button
                  onClick={() => handleSwapSelect(idx)}
                  className={`w-5 h-5 rounded flex items-center justify-center shrink-0 transition-colors ${
                    isSelected ? "bg-blue-600 text-white" : isTarget ? "bg-green-600 text-white animate-pulse" : "bg-gray-700/50 text-gray-400 hover:bg-gray-600 hover:text-gray-200"
                  }`}
                  title={isSelected ? "Cancel swap" : isTarget ? "Swap here" : "Swap player"}
                >
                  <ArrowUpDown className="w-3 h-3" />
                </button>
              );
            };

            return (
              <Card className="gradient-card rounded-xl p-4 border-0 overflow-hidden">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-white font-semibold">{myTeam.name}</h3>
                  {selectedSwapIndex !== null && (
                    <Button
                      onClick={() => { setSelectedSwapIndex(null); setSwapTargets([]); }}
                      variant="ghost"
                      size="sm"
                      className="text-gray-400 hover:text-white h-7 px-2 text-xs"
                    >
                      Cancel Swap
                    </Button>
                  )}
                </div>
                {selectedSwapIndex !== null && (
                  <p className="text-blue-400 text-xs mb-3">Tap a highlighted slot to swap players</p>
                )}
                <div className="space-y-5">
                  {posEntries.length > 0 && (
                    <div>
                      <p className="text-gray-400 text-[11px] uppercase font-bold tracking-wider mb-2">Position Players</p>
                      <div className="overflow-x-auto hide-scrollbar -mx-1 px-1" style={{ WebkitOverflowScrolling: "touch" }}>
                        <table className="w-full" style={{ minWidth: Math.max(300, 200 + leagueHittingCats.length * 52) + "px" }}>
                          <thead>
                            <tr className="border-b border-gray-700">
                              {isDraftCompleted && <th className="w-6 pb-1.5"></th>}
                              <th className="text-left text-[10px] text-gray-500 font-semibold uppercase pb-1.5 w-9 pl-1">Pos</th>
                              <th className="text-left text-[10px] text-gray-500 font-semibold uppercase pb-1.5 w-[140px]">Player</th>
                              {leagueHittingCats.map(stat => (
                                <th key={stat} className={`${STAT_COL} text-gray-400 font-semibold pb-1.5`}>{stat}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {posEntries.map(entry => {
                              const p = entry.player as Record<string, unknown> | null;
                              return (
                                <tr key={entry.slotIndex} className={getRowClass(entry.slotIndex)} onClick={() => swapTargets.includes(entry.slotIndex) ? handleSwapSelect(entry.slotIndex) : undefined}>
                                  {isDraftCompleted && <td className="py-1.5 pl-1">{renderSwapButton(entry)}</td>}
                                  <td className="py-1.5 pl-1">
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-700 text-gray-300">{entry.slotPos}</span>
                                  </td>
                                  <td className="py-1.5 pr-2">
                                    {p ? (
                                      <div>
                                        <p className="text-white text-xs font-medium truncate max-w-[130px]">{p.name as string}</p>
                                        <p className="text-gray-500 text-[10px]">{p.position as string} — {(p.teamAbbreviation || p.team) as string}</p>
                                      </div>
                                    ) : (
                                      <p className="text-gray-600 text-xs italic">Empty</p>
                                    )}
                                  </td>
                                  {leagueHittingCats.map(stat => (
                                    <td key={stat} className={`${STAT_COL} text-gray-300`}>{p ? (p[`stat${stat}`] as string ?? "-") : "-"}</td>
                                  ))}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {pitchEntries.length > 0 && (
                    <div>
                      <p className="text-gray-400 text-[11px] uppercase font-bold tracking-wider mb-2">Pitchers</p>
                      <div className="overflow-x-auto hide-scrollbar -mx-1 px-1" style={{ WebkitOverflowScrolling: "touch" }}>
                        <table className="w-full" style={{ minWidth: Math.max(300, 200 + leaguePitchingCats.length * 52) + "px" }}>
                          <thead>
                            <tr className="border-b border-gray-700">
                              {isDraftCompleted && <th className="w-6 pb-1.5"></th>}
                              <th className="text-left text-[10px] text-gray-500 font-semibold uppercase pb-1.5 w-9 pl-1">Pos</th>
                              <th className="text-left text-[10px] text-gray-500 font-semibold uppercase pb-1.5 w-[140px]">Player</th>
                              {leaguePitchingCats.map(stat => (
                                <th key={stat} className={`${STAT_COL} text-gray-400 font-semibold pb-1.5`}>{stat}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {pitchEntries.map(entry => {
                              const p = entry.player as Record<string, unknown> | null;
                              return (
                                <tr key={entry.slotIndex} className={getRowClass(entry.slotIndex)} onClick={() => swapTargets.includes(entry.slotIndex) ? handleSwapSelect(entry.slotIndex) : undefined}>
                                  {isDraftCompleted && <td className="py-1.5 pl-1">{renderSwapButton(entry)}</td>}
                                  <td className="py-1.5 pl-1">
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-700 text-gray-300">{entry.slotPos}</span>
                                  </td>
                                  <td className="py-1.5 pr-2">
                                    {p ? (
                                      <div>
                                        <p className="text-white text-xs font-medium truncate max-w-[130px]">{p.name as string}</p>
                                        <p className="text-gray-500 text-[10px]">{p.position as string} — {(p.teamAbbreviation || p.team) as string}</p>
                                      </div>
                                    ) : (
                                      <p className="text-gray-600 text-xs italic">Empty</p>
                                    )}
                                  </td>
                                  {leaguePitchingCats.map(stat => (
                                    <td key={stat} className={`${STAT_COL} text-gray-300`}>{p ? (p[`stat${stat}`] as string ?? "-") : "-"}</td>
                                  ))}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {benchEntries.length > 0 && (
                    <div>
                      <p className="text-gray-400 text-[11px] uppercase font-bold tracking-wider mb-2">Bench / IL <span className="text-gray-500 font-normal normal-case">(no scoring)</span></p>
                      <div className="space-y-1">
                        {benchEntries.map(entry => {
                          const p = entry.player;
                          const isTarget = swapTargets.includes(entry.slotIndex);
                          const isSelected = selectedSwapIndex === entry.slotIndex;
                          return (
                            <div
                              key={entry.slotIndex}
                              className={`flex items-center gap-2 py-1.5 rounded px-1 transition-colors ${
                                isSelected ? "bg-blue-900/30 ring-1 ring-blue-500/50" : isTarget ? "bg-green-900/20 ring-1 ring-green-500/30 cursor-pointer" : ""
                              }`}
                              onClick={() => isTarget ? handleSwapSelect(entry.slotIndex) : undefined}
                            >
                              {isDraftCompleted && renderSwapButton(entry)}
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-700 text-gray-300 shrink-0">{entry.slotPos}</span>
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
              </Card>
            );
          })() : (
            <Card className="gradient-card rounded-xl p-5 border-0">
              <p className="text-gray-400 text-sm text-center py-6">
                You don't have a team in this league.
              </p>
            </Card>
          )}
        </div>
      )}

      {activeTab === "players" && <PlayersTab leagueId={leagueId!} league={league!} user={user} />}

      {activeTab === "standings" && <StandingsTab leagueId={leagueId!} league={league!} teamsLoading={teamsLoading} teams={teams} />}

      {activeTab === "settings" && (
        <>
        <Card className="gradient-card rounded-xl p-5 border-0">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white font-semibold">League Settings</h3>
            {isCommissioner && !isEditing && (
              <Button
                onClick={startEditing}
                variant="ghost"
                size="sm"
                className="text-blue-400 hover:text-blue-300 h-8 px-2"
              >
                <Pencil className="w-3.5 h-3.5 mr-1" />
                Edit
              </Button>
            )}
            {isCommissioner && isEditing && (
              <div className="flex gap-2">
                <Button
                  onClick={() => setIsEditing(false)}
                  variant="ghost"
                  size="sm"
                  className="text-gray-400 hover:text-white h-8 px-3"
                >
                  Cancel
                </Button>
                <Button
                  onClick={saveSettings}
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-700 text-white h-8 px-3"
                  disabled={updateMutation.isPending}
                >
                  {updateMutation.isPending ? "Saving..." : "Save"}
                </Button>
              </div>
            )}
          </div>
          {isCommissioner ? (
            isEditing ? (
              <div className="space-y-4">
                <div>
                  <label className="text-gray-400 text-xs block mb-1">Max Teams</label>
                  <Input
                    type="number"
                    value={editMaxTeams}
                    onChange={(e) => setEditMaxTeams(e.target.value)}
                    className="bg-gray-800 border-gray-700 text-white text-sm h-9"
                  />
                </div>
                <div>
                  <label className="text-gray-400 text-xs block mb-1">League Type</label>
                  <Select value={editType} onValueChange={setEditType}>
                    <SelectTrigger className="bg-gray-800 border-gray-700 text-white text-sm h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Redraft">Redraft</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-gray-400 text-xs block mb-1">Status</label>
                  <Select value={editStatus} onValueChange={setEditStatus}>
                    <SelectTrigger className="bg-gray-800 border-gray-700 text-white text-sm h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Private">Private</SelectItem>
                      <SelectItem value="Public">Public</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-blue-400" />
                  <div>
                    <p className="text-gray-400 text-xs">Teams</p>
                    <p className="text-white font-medium text-sm">{teams?.length || 0} / {league.maxTeams}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-blue-400" />
                  <div>
                    <p className="text-gray-400 text-xs">Type</p>
                    <p className="text-white font-medium text-sm">{league.type}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-blue-400" />
                  <div>
                    <p className="text-gray-400 text-xs">Status</p>
                    <p className="text-white font-medium text-sm">{league.isPublic ? "Public" : "Private"}</p>
                  </div>
                </div>
              </div>
            )
          ) : (
            <p className="text-gray-400 text-sm text-center py-6">
              Only the commissioner can adjust league settings.
            </p>
          )}
        </Card>

        <Card className="gradient-card rounded-xl p-5 border-0 mt-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white font-semibold">Scoring Settings</h3>
            {isCommissioner && !isEditingScoring && (
              <Button
                onClick={startEditingScoring}
                variant="ghost"
                size="sm"
                className="text-blue-400 hover:text-blue-300 h-8 px-2"
              >
                <Pencil className="w-3.5 h-3.5 mr-1" />
                Edit
              </Button>
            )}
            {isCommissioner && isEditingScoring && (
              <div className="flex gap-2">
                <Button
                  onClick={() => setIsEditingScoring(false)}
                  variant="ghost"
                  size="sm"
                  className="text-gray-400 hover:text-white h-8 px-3"
                >
                  Cancel
                </Button>
                <Button
                  onClick={saveScoringSettings}
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-700 text-white h-8 px-3"
                  disabled={updateMutation.isPending}
                >
                  {updateMutation.isPending ? "Saving..." : "Save"}
                </Button>
              </div>
            )}
          </div>
          {isCommissioner ? (
            isEditingScoring ? (
              <div className="space-y-5">
                <div>
                  <label className="text-gray-400 text-xs block mb-1">Scoring Format</label>
                  <Select value={editScoringFormat} onValueChange={setEditScoringFormat}>
                    <SelectTrigger className="bg-gray-800 border-gray-700 text-white text-sm h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Roto">Roto</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {editScoringFormat === "Roto" && (
                  <>
                    <div>
                      <label className="text-white text-sm font-medium block mb-2">Hitting Categories</label>
                      <div className="flex flex-wrap gap-2">
                        {ALL_HITTING_STATS.map(stat => (
                          <button
                            key={stat}
                            type="button"
                            onClick={() => toggleHittingStat(stat)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                              editHittingCategories.includes(stat)
                                ? "bg-blue-600 text-white"
                                : "bg-gray-800 text-gray-400 border border-gray-700 hover:border-gray-500"
                            }`}
                          >
                            {stat}
                          </button>
                        ))}
                      </div>
                      <p className="text-gray-500 text-xs mt-2">{editHittingCategories.length} categories selected</p>
                    </div>
                    <div>
                      <label className="text-white text-sm font-medium block mb-2">Pitching Categories</label>
                      <div className="flex flex-wrap gap-2">
                        {ALL_PITCHING_STATS.map(stat => (
                          <button
                            key={stat}
                            type="button"
                            onClick={() => togglePitchingStat(stat)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                              editPitchingCategories.includes(stat)
                                ? "bg-green-600 text-white"
                                : "bg-gray-800 text-gray-400 border border-gray-700 hover:border-gray-500"
                            }`}
                          >
                            {stat}
                          </button>
                        ))}
                      </div>
                      <p className="text-gray-500 text-xs mt-2">{editPitchingCategories.length} categories selected</p>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-blue-400" />
                  <div>
                    <p className="text-gray-400 text-xs">Format</p>
                    <p className="text-white font-medium text-sm">{league.scoringFormat || "Roto"}</p>
                  </div>
                </div>
                {(league.scoringFormat || "Roto") === "Roto" && (
                  <>
                    <div>
                      <p className="text-gray-400 text-xs mb-2">Hitting Categories</p>
                      <div className="flex flex-wrap gap-1.5">
                        {(league.hittingCategories || ["R", "HR", "RBI", "SB", "AVG"]).map(stat => (
                          <span key={stat} className="px-2 py-1 bg-blue-600/20 text-blue-400 rounded text-xs font-medium">
                            {stat}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-gray-400 text-xs mb-2">Pitching Categories</p>
                      <div className="flex flex-wrap gap-1.5">
                        {(league.pitchingCategories || ["W", "SV", "K", "ERA", "WHIP"]).map(stat => (
                          <span key={stat} className="px-2 py-1 bg-green-600/20 text-green-400 rounded text-xs font-medium">
                            {stat}
                          </span>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-blue-400" />
                <div>
                  <p className="text-gray-400 text-xs">Format</p>
                  <p className="text-white font-medium text-sm">{league.scoringFormat || "Roto"}</p>
                </div>
              </div>
              {(league.scoringFormat || "Roto") === "Roto" && (
                <>
                  <div>
                    <p className="text-gray-400 text-xs mb-2">Hitting Categories</p>
                    <div className="flex flex-wrap gap-1.5">
                      {(league.hittingCategories || ["R", "HR", "RBI", "SB", "AVG"]).map(stat => (
                        <span key={stat} className="px-2 py-1 bg-blue-600/20 text-blue-400 rounded text-xs font-medium">
                          {stat}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-gray-400 text-xs mb-2">Pitching Categories</p>
                    <div className="flex flex-wrap gap-1.5">
                      {(league.pitchingCategories || ["W", "SV", "K", "ERA", "WHIP"]).map(stat => (
                        <span key={stat} className="px-2 py-1 bg-green-600/20 text-green-400 rounded text-xs font-medium">
                          {stat}
                        </span>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </Card>

        <Card className="gradient-card rounded-xl p-5 border-0 mt-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white font-semibold">Roster Settings</h3>
            {isCommissioner && !isEditingRoster && (
              <Button
                onClick={startEditingRoster}
                variant="ghost"
                size="sm"
                className="text-blue-400 hover:text-blue-300 h-8 px-2"
              >
                <Pencil className="w-3.5 h-3.5 mr-1" />
                Edit
              </Button>
            )}
            {isCommissioner && isEditingRoster && (
              <div className="flex gap-2">
                <Button
                  onClick={() => setIsEditingRoster(false)}
                  variant="ghost"
                  size="sm"
                  className="text-gray-400 hover:text-white h-8 px-3"
                >
                  Cancel
                </Button>
                <Button
                  onClick={saveRosterSettings}
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-700 text-white h-8 px-3"
                  disabled={updateMutation.isPending}
                >
                  {updateMutation.isPending ? "Saving..." : "Save"}
                </Button>
              </div>
            )}
          </div>
          {isCommissioner ? (
            isEditingRoster ? (
              <div className="space-y-2">
                {ALL_POSITIONS.map((pos) => (
                  <div key={pos} className="flex items-center justify-between py-1.5 px-2 rounded-lg bg-gray-800/50">
                    <span className="text-white text-sm font-medium w-12">{pos}</span>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => updatePositionCount(pos, -1)}
                        className="w-7 h-7 rounded-full bg-gray-700 hover:bg-gray-600 text-white flex items-center justify-center text-sm font-bold"
                        disabled={(editRosterCounts[pos] || 0) === 0}
                      >
                        −
                      </button>
                      <span className="text-white text-sm font-semibold w-5 text-center">
                        {editRosterCounts[pos] || 0}
                      </span>
                      <button
                        type="button"
                        onClick={() => updatePositionCount(pos, 1)}
                        className="w-7 h-7 rounded-full bg-gray-700 hover:bg-gray-600 text-white flex items-center justify-center text-sm font-bold"
                      >
                        +
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {(league.rosterPositions || []).map((pos, index) => (
                  <Badge key={index} className="bg-gray-700 text-white text-xs px-2 py-0.5">
                    {pos}
                  </Badge>
                ))}
              </div>
            )
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {(league.rosterPositions || []).map((pos, index) => (
                <Badge key={index} className="bg-gray-700 text-white text-xs px-2 py-0.5">
                  {pos}
                </Badge>
              ))}
            </div>
          )}
        </Card>

        {league.draftStatus === "completed" && (
          <Card className="gradient-card rounded-xl p-4 border-0 mt-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-yellow-600/20 flex items-center justify-center shrink-0">
                <Trophy className="w-5 h-5 text-yellow-400" />
              </div>
              <div className="flex-1">
                <p className="text-white font-semibold text-sm">Draft Completed</p>
                <p className="text-gray-400 text-xs">View the full draft board and results</p>
              </div>
              <Button
                onClick={() => setLocation(`/league/${leagueId}/draft`)}
                size="sm"
                className="bg-yellow-600 hover:bg-yellow-700 text-white text-xs h-8 px-4 shrink-0"
              >
                View Draft
              </Button>
            </div>
          </Card>
        )}

        <Card className="gradient-card rounded-xl p-5 border-0 mt-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white font-semibold">Draft Settings</h3>
            {isCommissioner && !isEditingDraft && league.draftStatus !== "completed" && (
              <Button
                onClick={startEditingDraft}
                variant="ghost"
                size="sm"
                className="text-blue-400 hover:text-blue-300 h-8 px-2"
              >
                <Pencil className="w-3.5 h-3.5 mr-1" />
                Edit
              </Button>
            )}
            {isCommissioner && isEditingDraft && (
              <div className="flex gap-2">
                <Button
                  onClick={() => setIsEditingDraft(false)}
                  variant="ghost"
                  size="sm"
                  className="text-gray-400 hover:text-white h-8 px-3"
                >
                  Cancel
                </Button>
                <Button
                  onClick={saveDraftSettings}
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-700 text-white h-8 px-3"
                  disabled={updateMutation.isPending}
                >
                  {updateMutation.isPending ? "Saving..." : "Save"}
                </Button>
              </div>
            )}
          </div>
          {isCommissioner ? (
            isEditingDraft ? (
              <div className="space-y-4">
                <div>
                  <label className="text-gray-400 text-xs block mb-1">Draft Type</label>
                  <Select value={editDraftType} onValueChange={setEditDraftType}>
                    <SelectTrigger className="bg-gray-800 border-gray-700 text-white text-sm h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Snake">Snake</SelectItem>
                      <SelectItem value="Auction">Auction</SelectItem>
                      <SelectItem value="Linear">Linear</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-gray-400 text-xs block mb-1">Draft Date</label>
                  <Input
                    type="datetime-local"
                    value={editDraftDate}
                    onChange={(e) => setEditDraftDate(e.target.value)}
                    className="bg-gray-800 border-gray-700 text-white text-sm h-9"
                  />
                </div>
                <div>
                  <label className="text-gray-400 text-xs block mb-1">Seconds Per Pick</label>
                  <Input
                    type="number"
                    value={editSecondsPerPick}
                    onChange={(e) => setEditSecondsPerPick(e.target.value)}
                    className="bg-gray-800 border-gray-700 text-white text-sm h-9"
                  />
                </div>
                <div>
                  <label className="text-gray-400 text-xs block mb-1">Draft Order</label>
                  <Select value={editDraftOrder} onValueChange={setEditDraftOrder}>
                    <SelectTrigger className="bg-gray-800 border-gray-700 text-white text-sm h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Random">Random</SelectItem>
                      <SelectItem value="Manual">Manual</SelectItem>
                      <SelectItem value="Standings">Standings</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-gray-400 text-xs">Draft Type</p>
                  <p className="text-white font-medium text-sm">{league.draftType || "Snake"}</p>
                </div>
                <div>
                  <p className="text-gray-400 text-xs">Draft Date</p>
                  <p className="text-white font-medium text-sm">{league.draftDate ? new Date(league.draftDate).toLocaleDateString() : "TBD"}</p>
                </div>
                <div>
                  <p className="text-gray-400 text-xs">Seconds Per Pick</p>
                  <p className="text-white font-medium text-sm">{league.secondsPerPick || 60}s</p>
                </div>
                <div>
                  <p className="text-gray-400 text-xs">Draft Order</p>
                  <p className="text-white font-medium text-sm">{league.draftOrder || "Random"}</p>
                </div>
              </div>
            )
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-gray-400 text-xs">Draft Type</p>
                <p className="text-white font-medium text-sm">{league.draftType || "Snake"}</p>
              </div>
              <div>
                <p className="text-gray-400 text-xs">Draft Date</p>
                <p className="text-white font-medium text-sm">{league.draftDate ? new Date(league.draftDate).toLocaleDateString() : "TBD"}</p>
              </div>
              <div>
                <p className="text-gray-400 text-xs">Seconds Per Pick</p>
                <p className="text-white font-medium text-sm">{league.secondsPerPick || 60}s</p>
              </div>
              <div>
                <p className="text-gray-400 text-xs">Draft Order</p>
                <p className="text-white font-medium text-sm">{league.draftOrder || "Random"}</p>
              </div>
            </div>
          )}
        </Card>

        {isCommissioner && (
          <Card className="gradient-card rounded-xl p-5 border-0 mt-4 border border-red-900/30">
            <h3 className="text-red-400 font-semibold mb-2">Danger Zone</h3>
            <p className="text-gray-400 text-sm mb-4">
              Permanently delete this league and all its data. Draft position data used for ADP calculations will be preserved.
            </p>
            <Button
              onClick={() => setShowDeleteConfirm(true)}
              variant="outline"
              className="w-full border-red-800 text-red-400 hover:bg-red-900/30 hover:text-red-300 gap-2"
            >
              <Trash2 className="w-4 h-4" />
              Delete League
            </Button>
          </Card>
        )}

        <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
          <DialogContent className="bg-gray-900 border-gray-700 max-w-sm">
            <DialogHeader>
              <div className="flex items-center gap-3 mb-1">
                <div className="w-10 h-10 rounded-full bg-red-600/20 flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-red-400" />
                </div>
                <DialogTitle className="text-white text-lg">Delete League?</DialogTitle>
              </div>
              <DialogDescription className="text-gray-400 text-sm pt-2">
                This will permanently delete <span className="text-white font-semibold">{league.name}</span>, all teams, and draft picks. This action cannot be undone. ADP data will be preserved.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="flex gap-2 mt-2">
              <Button
                onClick={() => setShowDeleteConfirm(false)}
                variant="outline"
                className="flex-1 border-gray-600 text-gray-300 hover:bg-gray-800"
              >
                Cancel
              </Button>
              <Button
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white"
              >
                {deleteMutation.isPending ? "Deleting..." : "Delete League"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </>
      )}
    </div>
  );
}
