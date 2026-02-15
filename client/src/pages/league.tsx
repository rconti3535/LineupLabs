import { useState, useEffect } from "react";
import { useRoute, useLocation, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Player, League, Team, DraftPick, Activity, Waiver } from "@shared/schema";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { 
  Users, 
  Trophy, 
  Calendar, 
  TrendingUp, 
  MessageSquare, 
  Settings, 
  Plus, 
  ArrowLeft,
  Search,
  ChevronRight,
  Clock,
  Pencil,
  Trash2,
  X,
  ArrowUpDown
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { assignPlayersToRosterWithPicks, getSwapTargets, type RosterEntry } from "@/lib/roster-utils";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Tab = "roster" | "players" | "standings" | "settings";

const HITTING_STAT_MAP: Record<string, { key: keyof Player; label: string }> = {
  R: { key: "statR", label: "R" },
  HR: { key: "statHR", label: "HR" },
  RBI: { key: "statRBI", label: "RBI" },
  SB: { key: "statSB", label: "SB" },
  AVG: { key: "statAVG", label: "AVG" },
};

const PITCHING_STAT_MAP: Record<string, { key: keyof Player; label: string }> = {
  W: { key: "statW", label: "W" },
  SV: { key: "statSV", label: "SV" },
  K: { key: "statSO", label: "K" },
  ERA: { key: "statERA", label: "ERA" },
  WHIP: { key: "statWHIP", label: "WHIP" },
};

const BATTER_POSITIONS = ["All", "C", "1B", "2B", "3B", "SS", "OF", "DH"];
const PITCHER_POSITIONS = ["All", "SP", "RP", "P"];

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
    <div 
      className="flex items-center gap-3 py-2 border-b border-gray-800/50 cursor-pointer hover:bg-white/[0.02]"
      onClick={() => !isPending && onSelect(pick.id)}
    >
      <div className="w-8 h-8 rounded bg-gray-800 flex items-center justify-center shrink-0 border border-gray-700">
        <span className="text-[10px] font-bold text-gray-400">{slotLabel}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-white text-xs font-medium truncate">{player?.name || "Loading..."}</p>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-blue-400 font-medium">{player?.position}</span>
          <span className="text-[10px] text-gray-500">{player?.teamAbbreviation}</span>
        </div>
      </div>
      <div className="w-6 h-6 rounded-full bg-red-600/20 flex items-center justify-center border border-red-900/30">
        <X className="w-3 h-3 text-red-400" />
      </div>
    </div>
  );
}

function PlayersTab({ leagueId, league, user }: { leagueId: number; league: League; user: any }) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [positionFilter, setPositionFilter] = useState("All");
  const [playerType, setPlayerType] = useState<"batters" | "pitchers">("batters");
  const [rosterStatus, setRosterStatus] = useState<"free_agents" | "rostered" | "all">("free_agents");
  const [statView, setStatView] = useState<"adp" | "2025stats" | "2026proj" | "2026stats">("adp");
  const [addDropPlayer, setAddDropPlayer] = useState<Player | null>(null);
  const [waiverClaimPlayer, setWaiverClaimPlayer] = useState<Player | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const { data, isLoading } = useQuery<{ players: Player[]; total: number }>({
    queryKey: ["/api/leagues", leagueId, "available-players", debouncedQuery, positionFilter, playerType, rosterStatus],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (debouncedQuery) params.set("q", debouncedQuery);
      if (positionFilter !== "All") params.set("position", positionFilter);
      params.set("type", playerType);
      if (rosterStatus !== "all") params.set("status", rosterStatus);
      params.set("limit", "50");
      const res = await fetch(`/api/leagues/${leagueId}/available-players?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch available players");
      return res.json();
    }
  });

  const { data: myPicks = [] } = useQuery<DraftPick[]>({
    queryKey: ["/api/leagues", leagueId, "draft-picks", user?.id],
    queryFn: async () => {
      const res = await fetch(`/api/leagues/${leagueId}/draft-picks`);
      if (!res.ok) throw new Error("Failed");
      const allPicks: DraftPick[] = await res.json();
      const teamsRes = await fetch(`/api/teams/league/${leagueId}`);
      const teams: Team[] = await teamsRes.json();
      const userTeam = teams.find(t => t.userId === user?.id);
      return allPicks.filter(p => p.teamId === userTeam?.id);
    },
    enabled: !!user?.id
  });

  const { data: waiverPlayerIdsData } = useQuery<number[]>({
    queryKey: ["/api/leagues", leagueId, "waivers", "player-ids"],
    queryFn: async () => {
      const res = await fetch(`/api/leagues/${leagueId}/waivers`);
      if (!res.ok) throw new Error("Failed");
      const waivers: any[] = await res.json();
      return waivers.map(w => w.playerId);
    }
  });
  const waiverPlayerIds = new Set(waiverPlayerIdsData || []);

  const addMutation = useMutation({
    mutationFn: async (playerId: number) => {
      const res = await apiRequest("POST", `/api/leagues/${leagueId}/add-player`, { userId: user?.id, playerId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "available-players"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "draft-picks"] });
      toast({ title: "Player added to your roster" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to add player", description: error.message, variant: "destructive" });
    }
  });

  const claimMutation = useMutation({
    mutationFn: async ({ playerId, dropPickId }: { playerId: number; dropPickId?: number }) => {
      const res = await apiRequest("POST", `/api/leagues/${leagueId}/waiver-claim`, { userId: user?.id, playerId, dropPickId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "available-players"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "my-claims"] });
      setWaiverClaimPlayer(null);
      toast({ title: "Waiver claim submitted" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to submit claim", description: error.message, variant: "destructive" });
    }
  });

  const addDropMutation = useMutation({
    mutationFn: async ({ addPlayerId, dropPickId }: { addPlayerId: number; dropPickId: number }) => {
      const res = await apiRequest("POST", `/api/leagues/${leagueId}/add-drop`, { userId: user?.id, addPlayerId, dropPickId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "available-players"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "draft-picks"] });
      setAddDropPlayer(null);
      toast({ title: "Player added and dropped successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Add/Drop failed", description: error.message, variant: "destructive" });
    }
  });

  const hittingCats = league.hittingCategories || ["R", "HR", "RBI", "SB", "AVG"];
  const pitchingCats = league.pitchingCategories || ["W", "SV", "K", "ERA", "WHIP"];
  const activeCats = playerType === "batters" ? hittingCats : pitchingCats;
  const statMap = playerType === "batters" ? HITTING_STAT_MAP : PITCHING_STAT_MAP;
  const posOptions = playerType === "batters" ? BATTER_POSITIONS : PITCHER_POSITIONS;

  type PlayerWithAdp = Player & { adpValue?: number | null };

  const PROJ_HITTING_MAP: Record<string, keyof Player> = {
    R: "projR", HR: "projHR", RBI: "projRBI", SB: "projSB",
    AVG: "projAVG", H: "projH", "2B": "proj2B", "3B": "proj3B",
    BB: "projBB", K: "projK", OBP: "projOBP",
    SLG: "projSLG", OPS: "projOPS", TB: "projTB",
    CS: "projCS", HBP: "projHBP", AB: "projAB", PA: "projPA",
  };

  const PROJ_PITCHING_MAP: Record<string, keyof Player> = {
    W: "projW", SV: "projSV", ERA: "projERA",
    WHIP: "projWHIP", L: "projL", QS: "projQS",
    HLD: "projHLD", IP: "projIP", SO: "projSO", K: "projSO",
    CG: "projCG", SHO: "projSHO", BSV: "projBSV",
  };

  const getStatValue = (player: PlayerWithAdp, cat: string): string => {
    if (statView === "2026stats") return "-";
    if (statView === "2026proj") {
      const projMap = playerType === "batters" ? PROJ_HITTING_MAP : PROJ_PITCHING_MAP;
      const key = projMap[cat];
      if (!key) return "-";
      const raw = player[key];
      if (raw === null || raw === undefined) return "-";
      return String(raw);
    }
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
    "2026stats": "2026 Stats"
  };

  const rosterPositions = league.rosterPositions || [];
  const myTeamPicks = myPicks || [];
  const hasOpenSlot = myTeamPicks.length < rosterPositions.length;
  const rosteredPlayerIds = new Set((myPicks || []).map(p => p.playerId));

  return (
    <div className="space-y-4">
      <div className="flex gap-2 p-1 bg-gray-900/50 rounded-lg border border-gray-800">
        <button
          className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${playerType === "batters" ? "bg-blue-600 text-white shadow-lg" : "text-gray-400 hover:text-gray-300"}`}
          onClick={() => { setPlayerType("batters"); setPositionFilter("All"); }}
        >
          Batters
        </button>
        <button
          className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${playerType === "pitchers" ? "bg-blue-600 text-white shadow-lg" : "text-gray-400 hover:text-gray-300"}`}
          onClick={() => { setPlayerType("pitchers"); setPositionFilter("All"); }}
        >
          Pitchers
        </button>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
          <Input
            placeholder="Search players..."
            className="pl-8 bg-gray-900 border-gray-800 text-xs h-9"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <Select value={rosterStatus} onValueChange={(v: "free_agents" | "rostered" | "all") => setRosterStatus(v)}>
            <SelectTrigger className="w-[100px] bg-gray-900 border-gray-800 text-[11px] h-9 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="free_agents">Free Agents</SelectItem>
              <SelectItem value="rostered">Rostered</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
          <Select value={positionFilter} onValueChange={setPositionFilter}>
            <SelectTrigger className="w-[70px] bg-gray-900 border-gray-800 text-[11px] h-9 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {posOptions.map(pos => (
                <SelectItem key={pos} value={pos}>{pos}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

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
                        <span className="text-white text-[11px]">{player.externalAdp ? player.externalAdp : (player.adpValue && player.adpValue < 9999 ? player.adpValue : "-")}</span>
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

function StandingsTab({ leagueId, league, teamsLoading, teams }: { leagueId: number; league: League; teamsLoading: boolean; teams: Team[] | undefined }) {
  const { data: standings, isLoading: standingsLoading } = useQuery<any>({
    queryKey: ["/api/leagues", leagueId, "standings"],
    queryFn: async () => {
      const res = await fetch(`/api/leagues/${leagueId}/standings`);
      if (!res.ok) throw new Error("Failed to fetch standings");
      return res.json();
    },
    enabled: !!leagueId,
  });

  if (standingsLoading || teamsLoading) return <div className="space-y-3"><Skeleton className="h-20 w-full rounded-xl" /><Skeleton className="h-60 w-full rounded-xl" /></div>;

  const hittingCats = league.hittingCategories || ["R", "HR", "RBI", "SB", "AVG"];
  const pitchingCats = league.pitchingCategories || ["W", "SV", "K", "ERA", "WHIP"];

  return (
    <div className="space-y-6">
      <Card className="gradient-card rounded-xl border-0 overflow-hidden">
        <div className="p-4 border-b border-white/5 bg-white/5">
          <h3 className="text-white font-bold text-sm uppercase tracking-wider flex items-center gap-2">
            <Trophy className="w-4 h-4 text-yellow-500" />
            League Standings
          </h3>
        </div>
        <div className="overflow-x-auto hide-scrollbar">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-900/50">
                <th className="text-left text-[10px] text-gray-500 font-bold uppercase py-3 pl-4 w-8">#</th>
                <th className="text-left text-[10px] text-gray-500 font-bold uppercase py-3 pl-2">Team</th>
                <th className="text-right text-[10px] text-gray-500 font-bold uppercase py-3 pr-4">Points</th>
              </tr>
            </thead>
            <tbody>
              {standings?.map((team: any, i: number) => (
                <tr key={team.teamId} className="border-b border-gray-800/50 hover:bg-white/[0.02]">
                  <td className="py-3.5 pl-4 text-xs font-medium text-gray-400">{i + 1}</td>
                  <td className="py-3.5 pl-2">
                    <div className="flex items-center gap-2">
                      <p className="text-white text-xs font-semibold">{team.teamName}</p>
                      {team.isCommissioner && (
                        <Badge className="text-[9px] px-1 py-0 bg-yellow-600 text-white border-0">Commish</Badge>
                      )}
                    </div>
                  </td>
                  <td className="py-3.5 pr-4 text-right">
                    <span className="text-blue-400 text-xs font-bold">{team.totalPoints.toFixed(1)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="gradient-card rounded-xl border-0 overflow-hidden">
        <div className="p-4 border-b border-white/5 bg-white/5">
          <h3 className="text-white font-bold text-sm uppercase tracking-wider">Hitting Stats</h3>
        </div>
        <div className="overflow-x-auto hide-scrollbar">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-900/50">
                <th className="text-left text-[10px] text-gray-500 font-bold uppercase py-3 pl-4">Team</th>
                {hittingCats.map(cat => <th key={cat} className="text-right text-[10px] text-gray-500 font-bold uppercase py-3 pr-4">{cat}</th>)}
              </tr>
            </thead>
            <tbody>
              {standings?.map((team: any) => (
                <tr key={team.teamId} className="border-b border-gray-800/50">
                  <td className="py-3.5 pl-4 text-xs font-medium text-white truncate max-w-[100px]">{team.teamName}</td>
                  {hittingCats.map(cat => (
                    <td key={cat} className="py-3.5 pr-4 text-right">
                      <p className="text-gray-300 text-xs">{team.categories.hitting[cat]?.value || 0}</p>
                      <p className="text-[9px] text-blue-500 font-medium">({team.categories.hitting[cat]?.points || 0})</p>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="gradient-card rounded-xl border-0 overflow-hidden">
        <div className="p-4 border-b border-white/5 bg-white/5">
          <h3 className="text-white font-bold text-sm uppercase tracking-wider">Pitching Stats</h3>
        </div>
        <div className="overflow-x-auto hide-scrollbar">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-900/50">
                <th className="text-left text-[10px] text-gray-500 font-bold uppercase py-3 pl-4">Team</th>
                {pitchingCats.map(cat => <th key={cat} className="text-right text-[10px] text-gray-500 font-bold uppercase py-3 pr-4">{cat}</th>)}
              </tr>
            </thead>
            <tbody>
              {standings?.map((team: any) => (
                <tr key={team.teamId} className="border-b border-gray-800/50">
                  <td className="py-3.5 pl-4 text-xs font-medium text-white truncate max-w-[100px]">{team.teamName}</td>
                  {pitchingCats.map(cat => (
                    <td key={cat} className="py-3.5 pr-4 text-right">
                      <p className="text-gray-300 text-xs">{team.categories.pitching[cat]?.value || 0}</p>
                      <p className="text-[9px] text-green-500 font-medium">({team.categories.pitching[cat]?.points || 0})</p>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
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

  const cancelClaimMut = useMutation({
    mutationFn: async (claimId: number) => {
      const res = await apiRequest("DELETE", `/api/leagues/${leagueId}/waiver-claim/${claimId}?userId=${user?.id}`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Waiver claim cancelled" });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "my-claims"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "waivers"] });
    },
    onError: (err: Error) => {
      toast({ title: err.message || "Failed to cancel claim", variant: "destructive" });
    },
  });

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
          description: `"${league?.name}" has been permanently deleted.`,
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
    const positions = league.rosterPositions || ["C", "1B", "2B", "3B", "SS", "OF", "OF", "OF", "UT", "SP", "SP", "RP", "RP", "BN", "BN", "IL"];
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

  const ALL_POSITIONS = ["C", "1B", "2B", "3B", "SS", "OF", "UT", "DH", "SP", "RP", "P", "BN", "IL"];

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
        <Button onClick={() => setLocation("/teams")} variant="ghost" className="mt-4 text-blue-400">Back to Teams</Button>
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
    <div className="px-4 py-4">
      <div className="flex items-center justify-between mb-4">
        <Button onClick={() => setLocation("/teams")} variant="ghost" size="icon" className="text-gray-400 hover:text-white shrink-0 -ml-2 h-9 w-9"><ArrowLeft className="w-5 h-5" /></Button>
        <div className="flex-1 flex justify-center min-w-0 px-2">
          <div className="bg-white/5 border border-white/10 px-4 py-1.5 rounded-full shadow-inner backdrop-blur-sm max-w-full">
            <h1 className="text-sm font-bold text-white truncate tracking-wide uppercase">{league.name}</h1>
          </div>
        </div>
        <div className="w-9 shrink-0" />
      </div>

      <div className="flex border-b border-gray-700 mb-4">
        {tabs.map((tab) => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)} className={`flex-1 py-2.5 text-sm font-medium text-center transition-colors ${activeTab === tab.key ? "text-blue-400 border-b-2 border-blue-400" : "text-gray-400 hover:text-gray-300"}`}>{tab.label}</button>
        ))}
      </div>

      {activeTab === "roster" && (
        <div className="space-y-4">
          {league.draftStatus !== "completed" ? (
            <Card className="gradient-card rounded-xl p-4 border-0 mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-600/20 flex items-center justify-center shrink-0"><Calendar className="w-5 h-5 text-blue-400" /></div>
                <div className="flex-1">
                  <p className="text-white font-semibold text-sm">Draft Room</p>
                  <Button onClick={() => setLocation(`/league/${leagueId}/draft`)} className="mt-2 bg-blue-600 hover:bg-blue-700 text-white text-xs h-8 px-4" size="sm">Enter Draft Room</Button>
                </div>
              </div>
            </Card>
          ) : null}

          {myTeam ? (() => {
            const isPitcherPlayer = (p: Player) => ["SP", "RP", "P"].includes(p.position);
            const isDraftCompleted = league.draftStatus === "completed";
            const STAT_COL = "w-[42px] text-center text-[11px] shrink-0";

            const getRowClass = (idx: number) => {
              if (selectedSwapIndex === idx) return "border-b border-blue-500/50 bg-blue-900/30";
              if (swapTargets.includes(idx)) return "border-b border-green-500/30 bg-green-900/20 cursor-pointer";
              return "border-b border-gray-800/50";
            };

            return (
              <div className="overflow-hidden">
                <div className="flex items-center justify-between mb-3 px-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-white font-semibold">{myTeam.name}</h3>
                    {user?.id === league.createdBy && (
                      <Badge className="text-[10px] px-1.5 py-0 shrink-0 bg-yellow-600 text-white border-0">Commish</Badge>
                    )}
                  </div>
                  {selectedSwapIndex !== null && (
                    <Button onClick={() => { setSelectedSwapIndex(null); setSwapTargets([]); }} variant="ghost" size="sm" className="text-gray-400 hover:text-white h-7 px-2 text-xs">Cancel Swap</Button>
                  )}
                </div>
                {selectedSwapIndex !== null && (
                  <p className="text-blue-400 text-xs mb-3 px-1">Tap a highlighted slot to swap players</p>
                )}
                
                <div className="overflow-x-auto hide-scrollbar -mx-1 px-1">
                  <table className="w-full" style={{ minWidth: "300px" }}>
                    <thead>
                      <tr className="border-b border-gray-700">
                        <th className="text-left text-[10px] text-gray-500 font-semibold uppercase pb-1.5 w-9 pl-1">Pos</th>
                        <th className="text-left text-[10px] text-gray-500 font-semibold uppercase pb-1.5 w-[140px]">Player</th>
                        {leagueHittingCats.map(stat => (
                          <th key={stat} className={`${STAT_COL} text-gray-400 font-semibold pb-1.5`}>{stat}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rosterEntries.map(entry => {
                        const p = entry.player as Record<string, any> | null;
                        const isPitcher = p ? isPitcherPlayer(p as Player) : false;
                        const activeCats = isPitcher ? leaguePitchingCats : leagueHittingCats;
                        const isBench = entry.slotPos === "BN" || entry.slotPos === "IL";
                        
                        return (
                          <tr key={entry.slotIndex} className={getRowClass(entry.slotIndex)} onClick={() => swapTargets.includes(entry.slotIndex) ? handleSwapSelect(entry.slotIndex) : undefined}>
                            <td className="py-1.5 pl-1">
                              <button
                                onClick={() => handleSwapSelect(entry.slotIndex)}
                                className={`text-[10px] font-bold px-1.5 py-0.5 rounded transition-colors ${
                                  selectedSwapIndex === entry.slotIndex ? "bg-blue-600 text-white" : swapTargets.includes(entry.slotIndex) ? "bg-green-600 text-white animate-pulse" : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                                }`}
                              >
                                {entry.slotPos}
                              </button>
                            </td>
                            <td className="py-1.5 pr-2">
                              {p ? (
                                <div className="cursor-pointer" onClick={() => isDraftCompleted && handleSwapSelect(entry.slotIndex)}>
                                  <p className="text-white text-xs font-medium truncate max-w-[130px]">{p.name}</p>
                                  <p className="text-gray-500 text-[10px]">{p.position} — {p.teamAbbreviation || p.team}</p>
                                </div>
                              ) : (
                                <div className="cursor-pointer" onClick={() => isDraftCompleted && handleSwapSelect(entry.slotIndex)}>
                                  <p className="text-gray-600 text-xs italic">Empty</p>
                                </div>
                              )}
                            </td>
                            {leagueHittingCats.map((cat, catIdx) => {
                              const statName = activeCats[catIdx];
                              if (!statName) return <td key={cat} className={`${STAT_COL}`}></td>;
                              return (
                                <td key={cat} className={`${STAT_COL} ${isBench ? "text-gray-500 opacity-60" : "text-gray-300"}`}>
                                  {p ? (p[`stat${statName}`] ?? "-") : "-"}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })() : (
            <Card className="gradient-card rounded-xl p-5 border-0">
              <p className="text-gray-400 text-sm text-center py-6">You don't have a team in this league.</p>
            </Card>
          )}
        </div>
      )}

      {activeTab === "players" && <PlayersTab leagueId={leagueId!} league={league!} user={user} />}
      {activeTab === "standings" && <StandingsTab leagueId={leagueId!} league={league!} teamsLoading={teamsLoading} teams={teams} />}

      {activeTab === "settings" && (
        <div className="space-y-4">
          <Card className="gradient-card rounded-xl p-5 border-0">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-semibold">League Settings</h3>
              {isCommissioner && !isEditing && (
                <Button onClick={startEditing} variant="ghost" size="sm" className="text-blue-400 hover:text-blue-300 h-8 px-2">
                  <Pencil className="w-3.5 h-3.5 mr-1" /> Edit
                </Button>
              )}
              {isCommissioner && isEditing && (
                <div className="flex gap-2">
                  <Button onClick={() => setIsEditing(false)} variant="ghost" size="sm" className="text-gray-400 hover:text-white h-8 px-3">Cancel</Button>
                  <Button onClick={saveSettings} size="sm" className="bg-blue-600 hover:bg-blue-700 text-white h-8 px-3" disabled={updateMutation.isPending}>Save</Button>
                </div>
              )}
            </div>
            {isEditing ? (
              <div className="space-y-4">
                <div>
                  <label className="text-gray-400 text-xs block mb-1">Max Teams</label>
                  <Input type="number" min="2" max="30" value={editMaxTeams} onChange={(e) => setEditMaxTeams(e.target.value)} className="bg-gray-800 border-gray-700 text-white text-sm h-9" />
                </div>
                <div>
                  <label className="text-gray-400 text-xs block mb-1">League Type</label>
                  <Select value={editType} onValueChange={setEditType}>
                    <SelectTrigger className="bg-gray-800 border-gray-700 text-white text-sm h-9"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="Redraft">Redraft</SelectItem></SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-gray-400 text-xs block mb-1">Status</label>
                  <Select value={editStatus} onValueChange={setEditStatus}>
                    <SelectTrigger className="bg-gray-800 border-gray-700 text-white text-sm h-9"><SelectValue /></SelectTrigger>
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
              </div>
            )}
          </Card>

          <Card className="gradient-card rounded-xl p-5 border-0">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-semibold">Scoring Settings</h3>
              {isCommissioner && !isEditingScoring && (
                <Button onClick={startEditingScoring} variant="ghost" size="sm" className="text-blue-400 hover:text-blue-300 h-8 px-2">
                  <Pencil className="w-3.5 h-3.5 mr-1" /> Edit
                </Button>
              )}
              {isCommissioner && isEditingScoring && (
                <div className="flex gap-2">
                  <Button onClick={() => setIsEditingScoring(false)} variant="ghost" size="sm" className="text-gray-400 hover:text-white h-8 px-3">Cancel</Button>
                  <Button onClick={saveScoringSettings} size="sm" className="bg-blue-600 hover:bg-blue-700 text-white h-8 px-3" disabled={updateMutation.isPending}>Save</Button>
                </div>
              )}
            </div>
            {isEditingScoring ? (
              <div className="space-y-5">
                <div>
                  <label className="text-gray-400 text-xs block mb-1">Scoring Format</label>
                  <Select value={editScoringFormat} onValueChange={setEditScoringFormat}>
                    <SelectTrigger className="bg-gray-800 border-gray-700 text-white text-sm h-9"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="Roto">Roto</SelectItem></SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-white text-sm font-medium block mb-2">Hitting Categories</label>
                  <div className="flex flex-wrap gap-2">
                    {ALL_HITTING_STATS.map(stat => (
                      <button key={stat} type="button" onClick={() => toggleHittingStat(stat)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${editHittingCategories.includes(stat) ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400 border border-gray-700 hover:border-gray-500"}`}>{stat}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-white text-sm font-medium block mb-2">Pitching Categories</label>
                  <div className="flex flex-wrap gap-2">
                    {ALL_PITCHING_STATS.map(stat => (
                      <button key={stat} type="button" onClick={() => togglePitchingStat(stat)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${editPitchingCategories.includes(stat) ? "bg-green-600 text-white" : "bg-gray-800 text-gray-400 border border-gray-700 hover:border-gray-500"}`}>{stat}</button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <p className="text-gray-400 text-xs mb-2">Hitting Categories</p>
                  <div className="flex flex-wrap gap-1.5">
                    {leagueHittingCats.map(stat => <span key={stat} className="px-2 py-1 bg-blue-600/20 text-blue-400 rounded text-xs font-medium">{stat}</span>)}
                  </div>
                </div>
                <div>
                  <p className="text-gray-400 text-xs mb-2">Pitching Categories</p>
                  <div className="flex flex-wrap gap-1.5">
                    {leaguePitchingCats.map(stat => <span key={stat} className="px-2 py-1 bg-green-600/20 text-green-400 rounded text-xs font-medium">{stat}</span>)}
                  </div>
                </div>
              </div>
            )}
          </Card>

          <Card className="gradient-card rounded-xl p-5 border-0">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-semibold">Roster Settings</h3>
              {isCommissioner && !isEditingRoster && (
                <Button onClick={startEditingRoster} variant="ghost" size="sm" className="text-blue-400 hover:text-blue-300 h-8 px-2">
                  <Pencil className="w-3.5 h-3.5 mr-1" /> Edit
                </Button>
              )}
              {isCommissioner && isEditingRoster && (
                <div className="flex gap-2">
                  <Button onClick={() => setIsEditingRoster(false)} variant="ghost" size="sm" className="text-gray-400 hover:text-white h-8 px-3">Cancel</Button>
                  <Button onClick={saveRosterSettings} size="sm" className="bg-blue-600 hover:bg-blue-700 text-white h-8 px-3" disabled={updateMutation.isPending}>Save</Button>
                </div>
              )}
            </div>
            {isEditingRoster ? (
              <div className="space-y-2">
                {ALL_POSITIONS.map((pos) => (
                  <div key={pos} className="flex items-center justify-between py-1.5 px-2 rounded-lg bg-gray-800/50">
                    <span className="text-white text-sm font-medium w-12">{pos}</span>
                    <div className="flex items-center gap-3">
                      <button type="button" onClick={() => updatePositionCount(pos, -1)} className="w-7 h-7 rounded-full bg-gray-700 hover:bg-gray-600 text-white flex items-center justify-center text-sm font-bold" disabled={(editRosterCounts[pos] || 0) === 0}>−</button>
                      <span className="text-white text-sm font-semibold w-5 text-center">{editRosterCounts[pos] || 0}</span>
                      <button type="button" onClick={() => updatePositionCount(pos, 1)} className="w-7 h-7 rounded-full bg-gray-700 hover:bg-gray-600 text-white flex items-center justify-center text-sm font-bold">+</button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {rosterSlots.map((pos, index) => <Badge key={index} className="bg-gray-700 text-white text-xs px-2 py-0.5">{pos}</Badge>)}
              </div>
            )}
          </Card>

          {isCommissioner && (
            <Card className="border-red-900/30 bg-red-950/10 p-5 rounded-xl">
              <h3 className="text-red-400 font-semibold mb-2">Danger Zone</h3>
              <p className="text-gray-400 text-xs mb-4">Deleting a league is permanent.</p>
              {!showDeleteConfirm ? (
                <Button onClick={() => setShowDeleteConfirm(true)} variant="destructive" size="sm">Delete League</Button>
              ) : (
                <div className="flex gap-2">
                  <Button onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending} variant="destructive" size="sm">Confirm Delete</Button>
                  <Button onClick={() => setShowDeleteConfirm(false)} variant="ghost" size="sm">Cancel</Button>
                </div>
              )}
            </Card>
          )}
        </div>
      )}

      <Dialog open={!!dropConfirm} onOpenChange={() => setDropConfirm(null)}>
        <DialogContent className="bg-gray-900 border-gray-700">
          <DialogHeader>
            <DialogTitle className="text-white">Drop Player</DialogTitle>
            <DialogDescription>Are you sure you want to drop this player?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDropConfirm(null)} className="text-gray-400">Cancel</Button>
            <Button variant="destructive" onClick={() => { if (dropConfirm) { dropMutation.mutate(dropConfirm.pickId); setDropConfirm(null); } }}>Drop Player</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
