import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Users, Trophy, Calendar, TrendingUp, Pencil, Trash2, AlertTriangle, ArrowUpDown, Search, Plus, X, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Menu, Clock, Settings, Shuffle, GripVertical } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { League, Team, DraftPick, Player } from "@shared/schema";
import { assignPlayersToRosterWithPicks, getSwapTargets, type RosterEntry } from "@/lib/roster-utils";

type Tab = "roster" | "matchup" | "players" | "standings";

interface StandingsData {
  format: string;
  standings: {
    teamId: number;
    teamName: string;
    userId: number | null;
    isCpu: boolean | null;
    categoryValues: Record<string, number>;
    categoryPoints?: Record<string, number>;
    totalPoints?: number;
    wins?: number;
    losses?: number;
    ties?: number;
    pointsFor?: number;
    pointsAgainst?: number;
    categoryWins?: number;
    categoryLosses?: number;
    categoryTies?: number;
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

interface MatchupData {
  format: string;
  matchups: {
    week: number;
    matchups: {
      home: { 
        teamId: number; 
        teamName: string; 
        userId: number | null; 
        score: number; 
        categoryValues: Record<string, number>;
        roster: { slotPos: string; player: Player | null }[];
      };
      away: { 
        teamId: number; 
        teamName: string; 
        userId: number | null; 
        score: number; 
        categoryValues: Record<string, number>;
        roster: { slotPos: string; player: Player | null }[];
      };
      categoryResults?: { cat: string; homeVal: number; awayVal: number; winner: "home" | "away" | "tie" }[];
    }[];
  }[];
}

interface MatchupDisplayProps {
  leagueId: number;
  league: League;
  user: { id: number } | null;
  title?: string;
}

function MatchupDisplay({ leagueId, league, user, title }: MatchupDisplayProps) {
  const [selectedWeek, setSelectedWeek] = useState(1);
  const [expandedMatchup, setExpandedMatchup] = useState<number | null>(null);

  const { data, isLoading } = useQuery<MatchupData>({
    queryKey: ["/api/leagues", leagueId, "matchups"],
    queryFn: async () => {
      const res = await fetch(`/api/leagues/${leagueId}/matchups`);
      if (!res.ok) throw new Error("Failed to load matchups");
      return res.json();
    },
  });

  useEffect(() => {
    if (data && user) {
      const userWeek = data.matchups.find(w =>
        w.matchups.some(m => m.home.userId === user.id || m.away.userId === user.id)
      );
      if (userWeek) {
        setSelectedWeek(userWeek.week);
        const matchupIdx = userWeek.matchups.findIndex(m => m.home.userId === user.id || m.away.userId === user.id);
        if (matchupIdx !== -1) setExpandedMatchup(matchupIdx);
      }
    }
  }, [data, user]);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-full bg-gray-800" />
        <Skeleton className="h-32 w-full bg-gray-800" />
        <Skeleton className="h-32 w-full bg-gray-800" />
      </div>
    );
  }

  if (!data || data.matchups.length === 0) {
    return (
      <Card className="gradient-card rounded-xl p-5 border-0">
        <p className="text-gray-400 text-sm text-center">No matchups available yet. Complete the draft to see matchups.</p>
      </Card>
    );
  }

  const totalWeeks = data.matchups.length;
  const currentWeekData = data.matchups.find(w => w.week === selectedWeek);
  const isPoints = data.format === "H2H Points";

  const SEASON_START = new Date(2026, 2, 23);
  const getWeekDates = (week: number) => {
    const mon = new Date(SEASON_START);
    mon.setDate(mon.getDate() + (week - 1) * 7);
    const sun = new Date(mon);
    sun.setDate(sun.getDate() + 6);
    const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return `${fmt(mon)} - ${fmt(sun)}`;
  };

  return (
    <div>
      {title && <h3 className="text-white font-semibold mb-4">{title}</h3>}
      <div className="flex items-center justify-between mb-4">
        <Button
          variant="ghost"
          size="icon"
          disabled={selectedWeek <= 1}
          onClick={() => setSelectedWeek(w => w - 1)}
          className="h-8 w-8 text-gray-400 hover:text-white disabled:opacity-30"
        >
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <div className="text-center">
          <span className="text-white font-semibold text-sm">Week {selectedWeek} of {totalWeeks}</span>
          <div className="text-gray-400 text-xs">{getWeekDates(selectedWeek)}</div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          disabled={selectedWeek >= totalWeeks}
          onClick={() => setSelectedWeek(w => w + 1)}
          className="h-8 w-8 text-gray-400 hover:text-white disabled:opacity-30"
        >
          <ChevronRight className="w-5 h-5" />
        </Button>
      </div>

      <div className="space-y-3">
        {currentWeekData?.matchups.map((m, idx) => {
          const userInMatchup = user && (m.home.userId === user.id || m.away.userId === user.id);
          const homeWins = m.home.score > m.away.score;
          const awayWins = m.away.score > m.home.score;
          const tied = m.home.score === m.away.score;
          const isExpanded = expandedMatchup === idx;

          return (
            <Card key={idx} className={`gradient-card rounded-xl border-0 overflow-hidden ${userInMatchup ? "ring-1 ring-blue-500/40" : ""}`}>
              <button 
                className="w-full text-left p-4 hover:bg-white/[0.02] transition-colors"
                onClick={() => setExpandedMatchup(isExpanded ? null : idx)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 text-left">
                    <p className={`font-semibold text-sm truncate ${homeWins ? "text-green-400" : "text-white"}`}>{m.home.teamName}</p>
                  </div>
                  <div className="flex items-center gap-2 px-3 shrink-0">
                    <span className={`text-lg font-bold ${homeWins ? "text-green-400" : tied ? "text-gray-400" : "text-white"}`}>
                      {isPoints ? m.home.score.toFixed(1) : m.home.score}
                    </span>
                    <span className="text-gray-600 text-[10px] font-bold uppercase tracking-wider">vs</span>
                    <span className={`text-lg font-bold ${awayWins ? "text-green-400" : tied ? "text-gray-400" : "text-white"}`}>
                      {isPoints ? m.away.score.toFixed(1) : m.away.score}
                    </span>
                  </div>
                  <div className="flex-1 text-right">
                    <p className={`font-semibold text-sm truncate ${awayWins ? "text-green-400" : "text-white"}`}>{m.away.teamName}</p>
                  </div>
                </div>
              </button>

              {isExpanded && (
                <div className="border-t border-gray-700/50 bg-black/20">
                  {m.categoryResults && (
                    <div className="px-4 py-2 bg-black/40 border-b border-gray-700/30">
                      <div className="grid grid-cols-3 gap-y-1 text-[11px]">
                        {m.categoryResults.map((cr, ci) => (
                          <div key={ci} className="flex items-center justify-between px-1.5 py-0.5 rounded contents">
                            <span className={`text-left ${cr.winner === "home" ? "text-green-400 font-bold" : "text-gray-400"}`}>
                              {formatStatValue(cr.cat, cr.homeVal)}
                            </span>
                            <span className="text-gray-500 font-bold text-center text-[10px] uppercase tracking-tighter">{cr.cat}</span>
                            <span className={`text-right ${cr.winner === "away" ? "text-green-400 font-bold" : "text-gray-400"}`}>
                              {formatStatValue(cr.cat, cr.awayVal)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  <div className="px-4 py-3 space-y-1">
                    <div className="flex items-center justify-between text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-2">
                      <span>{m.home.teamName} Lineup</span>
                      <span>{m.away.teamName} Lineup</span>
                    </div>
                    {m.home.roster.map((hSlot, i) => {
                      const aSlot = m.away.roster[i];
                      const isBench = hSlot.slotPos === "BN" || hSlot.slotPos === "IL";
                      if (isBench) return null; // Only show starters

                      return (
                        <div key={i} className="flex items-center gap-2 border-b border-gray-800/40 py-1.5 last:border-0">
                          <div className="flex-1 min-w-0 flex items-center gap-2">
                            <div className="w-6 text-[9px] text-gray-500 font-bold shrink-0">{hSlot.slotPos}</div>
                            <div className="min-w-0">
                              <p className="text-[11px] text-white font-medium truncate">{hSlot.player?.name || "Empty"}</p>
                              {hSlot.player && <p className="text-[9px] text-gray-500">{hSlot.player.position} - {hSlot.player.teamAbbreviation}</p>}
                            </div>
                          </div>
                          
                          <div className="w-4 flex justify-center shrink-0">
                            <div className="w-[1px] h-6 bg-gray-800" />
                          </div>

                          <div className="flex-1 min-w-0 flex items-center gap-2 justify-end text-right">
                            <div className="min-w-0">
                              <p className="text-[11px] text-white font-medium truncate">{aSlot.player?.name || "Empty"}</p>
                              {aSlot.player && <p className="text-[9px] text-gray-500">{aSlot.player.teamAbbreviation} - {aSlot.player.position}</p>}
                            </div>
                            <div className="w-6 text-[9px] text-gray-500 font-bold shrink-0">{aSlot.slotPos}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function MatchupTab({ leagueId, league, user }: { leagueId: number; league: League; user: { id: number } | null }) {
  return <MatchupDisplay leagueId={leagueId} league={league} user={user} />;
}

function TransactionsList({ leagueId }: { leagueId: number }) {
  const { data: transactions, isLoading } = useQuery<any[]>({
    queryKey: ["/api/leagues", leagueId, "transactions"],
  });

  if (isLoading) {
    return <div className="space-y-2 py-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}</div>;
  }

  if (!transactions || transactions.length === 0) {
    return <p className="text-gray-500 text-xs text-center py-8">No recent transactions</p>;
  }

  return (
    <div className="space-y-3 py-2">
      {transactions.map((t) => (
        <div key={t.id} className="flex items-center gap-3 p-3 rounded-xl bg-gray-800/40 border border-gray-700/50">
          <div className="w-10 h-10 rounded-full bg-gray-700 shrink-0 overflow-hidden flex items-center justify-center">
            {t.playerAvatar ? (
              <img src={t.playerAvatar} alt={t.playerName} className="w-full h-full object-cover" />
            ) : (
              <span className="text-gray-500 text-xs font-bold">{t.playerName?.[0]}</span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-xs font-semibold text-white truncate">{t.playerName}</p>
              <span className="text-[10px] text-gray-500 shrink-0">
                {new Date(t.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              </span>
            </div>
            <p className="text-[10px] text-gray-400">
              <span className="text-blue-400 font-medium">{t.teamName}</span>
              {t.type === 'add' ? ' added ' : t.type === 'drop' ? ' dropped ' : ' traded '}
              {t.playerName}
              {t.type === 'trade' && ` to ${t.teamBName} for ${t.playerBName}`}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

function StandingsTab({ leagueId, league, teamsLoading, teams, user }: { leagueId: number; league: League; teamsLoading: boolean; teams: Team[] | undefined; user: { id: number } | null }) {
  const [standingsSubTab, setStandingsSubTab] = useState<"standings" | "transactions">("standings");
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

  const { standings, hittingCategories, pitchingCategories, format } = standingsData;

  const rankClass = (idx: number) =>
    idx === 0 ? "text-yellow-400" : idx === 1 ? "text-gray-300" : idx === 2 ? "text-orange-400" : "text-gray-500";

  const teamCell = (team: typeof standings[0], idx: number) => (
    <td className="py-2 sticky left-0 bg-[#1a1d26] z-10 pl-1">
      <div className="flex items-center gap-2">
        <span className={`text-xs font-bold w-5 text-center shrink-0 ${rankClass(idx)}`}>{idx + 1}</span>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 overflow-hidden">
            <p className="text-white text-xs font-medium truncate">{team.teamName}</p>
            {team.userId === league.createdBy && (
              <Badge className="text-[8px] h-3 px-1 bg-yellow-600 text-white border-0 shrink-0">Commish</Badge>
            )}
          </div>
          {team.isCpu && <span className="text-[9px] text-gray-500">CPU</span>}
        </div>
      </div>
    </td>
  );

  const formatStatValue = (cat: string, val: number) => {
    if (["AVG", "OBP", "SLG", "OPS"].includes(cat)) return val.toFixed(3).replace(/^0/, "");
    if (["ERA", "WHIP"].includes(cat)) return val.toFixed(2);
    if (cat === "IP") return val.toFixed(1);
    return Math.round(val).toString();
  };

  if (format === "Roto") {
    const totalCats = hittingCategories.length + pitchingCategories.length;
    const minWidth = 140 + 48 + totalCats * 56;
    return (
      <div className="space-y-4">
        <div className="flex bg-[#1a1d26] p-1 rounded-xl border border-gray-800">
          <button
            onClick={() => setStandingsSubTab("standings")}
            className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors ${standingsSubTab === "standings" ? "bg-gray-800 text-white shadow-sm" : "text-gray-500 hover:text-gray-300"}`}
          >
            Standings
          </button>
          <button
            onClick={() => setStandingsSubTab("transactions")}
            className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors ${standingsSubTab === "transactions" ? "bg-gray-800 text-white shadow-sm" : "text-gray-500 hover:text-gray-300"}`}
          >
            Transactions
          </button>
        </div>

        {standingsSubTab === "standings" ? (
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
                      {teamCell(team, idx)}
                      <td className="text-center py-2">
                        <p className="text-yellow-400 text-xs font-bold">{(team.totalPoints ?? 0).toFixed(1)}</p>
                      </td>
                      {hittingCategories.map((cat, i) => {
                        const val = team.categoryValues[`h_${cat}`] || 0;
                        const pts = team.categoryPoints?.[`h_${cat}`] || 0;
                        return (
                          <td key={`h_${cat}`} className={`text-center py-2 ${i === 0 ? "border-l border-gray-700/50" : ""}`}>
                            <p className="text-white text-[11px] font-medium leading-tight">{formatStatValue(cat, val)}</p>
                            <p className="text-gray-500 text-[9px] leading-tight">{pts.toFixed(1)}</p>
                          </td>
                        );
                      })}
                      {pitchingCategories.map((cat, i) => {
                        const val = team.categoryValues[`p_${cat}`] || 0;
                        const pts = team.categoryPoints?.[`p_${cat}`] || 0;
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
        ) : (
          <Card className="gradient-card rounded-xl p-4 border-0">
            <h3 className="text-white font-semibold mb-1">Recent Transactions</h3>
            <TransactionsList leagueId={leagueId} />
          </Card>
        )}
      </div>
    );
  }

  if (format === "H2H Points" || format === "H2H Most Categories") {
    return (
      <div className="space-y-4">
        <div className="flex bg-[#1a1d26] p-1 rounded-xl border border-gray-800">
          <button
            onClick={() => setStandingsSubTab("standings")}
            className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors ${standingsSubTab === "standings" ? "bg-gray-800 text-white shadow-sm" : "text-gray-500 hover:text-gray-300"}`}
          >
            Standings
          </button>
          <button
            onClick={() => setStandingsSubTab("transactions")}
            className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors ${standingsSubTab === "transactions" ? "bg-gray-800 text-white shadow-sm" : "text-gray-500 hover:text-gray-300"}`}
          >
            Transactions
          </button>
        </div>

        {standingsSubTab === "standings" ? (
          <div className="space-y-6">
            <Card className="gradient-card rounded-xl p-4 border-0">
              <h3 className="text-white font-semibold mb-3">{format} Standings</h3>
              <div className="overflow-x-auto hide-scrollbar -mx-1 px-1" style={{ WebkitOverflowScrolling: "touch" }}>
                <table className="w-full" style={{ minWidth: "440px" }}>
                  <thead>
                    <tr className="border-b border-gray-700">
                      <th className="text-left text-[10px] text-gray-500 font-semibold uppercase pb-1.5 sticky left-0 bg-[#1a1d26] z-10 w-[140px] pl-1">Team</th>
                      <th className="text-center text-[10px] text-green-400 font-semibold uppercase pb-1.5 w-[40px]">W</th>
                      <th className="text-center text-[10px] text-red-400 font-semibold uppercase pb-1.5 w-[40px]">L</th>
                      <th className="text-center text-[10px] text-gray-400 font-semibold uppercase pb-1.5 w-[40px]">T</th>
                      <th className="text-center text-[10px] text-yellow-400 font-semibold uppercase pb-1.5 w-[50px]">PCT</th>
                      <th className="text-center text-[10px] text-blue-400 font-semibold uppercase pb-1.5 w-[60px]">PF</th>
                      <th className="text-center text-[10px] text-gray-400 font-semibold uppercase pb-1.5 w-[60px]">PA</th>
                    </tr>
                  </thead>
                  <tbody>
                    {standings.map((team, idx) => {
                      const w = team.wins ?? 0;
                      const l = team.losses ?? 0;
                      const t = team.ties ?? 0;
                      const total = w + l + t;
                      const pct = total === 0 ? ".000" : (w / total).toFixed(3).replace(/^0/, "");
                      return (
                        <tr key={team.teamId} className="border-b border-gray-800/50 hover:bg-white/[0.02]">
                          {teamCell(team, idx)}
                          <td className="text-center py-2"><p className="text-green-400 text-xs font-medium">{w}</p></td>
                          <td className="text-center py-2"><p className="text-red-400 text-xs font-medium">{l}</p></td>
                          <td className="text-center py-2"><p className="text-gray-400 text-xs font-medium">{t}</p></td>
                          <td className="text-center py-2"><p className="text-yellow-400 text-xs font-bold">{pct}</p></td>
                          <td className="text-center py-2"><p className="text-blue-400 text-xs font-medium">{(team.pointsFor ?? 0).toFixed(1)}</p></td>
                          <td className="text-center py-2"><p className="text-gray-400 text-xs font-medium">{(team.pointsAgainst ?? 0).toFixed(1)}</p></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>

            <MatchupDisplay leagueId={leagueId} league={league} user={user} title="League Matchups" />
          </div>
        ) : (
          <Card className="gradient-card rounded-xl p-4 border-0">
            <h3 className="text-white font-semibold mb-1">Recent Transactions</h3>
            <TransactionsList leagueId={leagueId} />
          </Card>
        )}
      </div>
    );
  }

  if (format === "H2H Each Category") {
    return (
      <div className="space-y-4">
        <div className="flex bg-[#1a1d26] p-1 rounded-xl border border-gray-800">
          <button
            onClick={() => setStandingsSubTab("standings")}
            className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors ${standingsSubTab === "standings" ? "bg-gray-800 text-white shadow-sm" : "text-gray-500 hover:text-gray-300"}`}
          >
            Standings
          </button>
          <button
            onClick={() => setStandingsSubTab("transactions")}
            className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors ${standingsSubTab === "transactions" ? "bg-gray-800 text-white shadow-sm" : "text-gray-500 hover:text-gray-300"}`}
          >
            Transactions
          </button>
        </div>

        {standingsSubTab === "standings" ? (
          <div className="space-y-6">
            <Card className="gradient-card rounded-xl p-4 border-0">
              <h3 className="text-white font-semibold mb-3">H2H Each Category Standings</h3>
              <div className="overflow-x-auto hide-scrollbar -mx-1 px-1" style={{ WebkitOverflowScrolling: "touch" }}>
                <table className="w-full" style={{ minWidth: "400px" }}>
                  <thead>
                    <tr className="border-b border-gray-700">
                      <th className="text-left text-[10px] text-gray-500 font-semibold uppercase pb-1.5 sticky left-0 bg-[#1a1d26] z-10 w-[140px] pl-1">Team</th>
                      <th className="text-center text-[10px] text-green-400 font-semibold uppercase pb-1.5 w-[48px]">CAT W</th>
                      <th className="text-center text-[10px] text-red-400 font-semibold uppercase pb-1.5 w-[48px]">CAT L</th>
                      <th className="text-center text-[10px] text-gray-400 font-semibold uppercase pb-1.5 w-[48px]">CAT T</th>
                      <th className="text-center text-[10px] text-yellow-400 font-semibold uppercase pb-1.5 w-[50px]">PCT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {standings.map((team, idx) => {
                      const w = team.categoryWins ?? 0;
                      const l = team.categoryLosses ?? 0;
                      const t = team.categoryTies ?? 0;
                      const total = w + l + t;
                      const pct = total === 0 ? ".000" : (w / total).toFixed(3).replace(/^0/, "");
                      return (
                        <tr key={team.teamId} className="border-b border-gray-800/50 hover:bg-white/[0.02]">
                          {teamCell(team, idx)}
                          <td className="text-center py-2"><p className="text-green-400 text-xs font-medium">{w}</p></td>
                          <td className="text-center py-2"><p className="text-red-400 text-xs font-medium">{l}</p></td>
                          <td className="text-center py-2"><p className="text-gray-400 text-xs font-medium">{t}</p></td>
                          <td className="text-center py-2"><p className="text-yellow-400 text-xs font-bold">{pct}</p></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>

            <MatchupDisplay leagueId={leagueId} league={league} user={user} title="League Matchups" />
          </div>
        ) : (
          <Card className="gradient-card rounded-xl p-4 border-0">
            <h3 className="text-white font-semibold mb-1">Recent Transactions</h3>
            <TransactionsList leagueId={leagueId} />
          </Card>
        )}
      </div>
    );
  }

  if (format === "Season Points") {
    return (
      <div className="space-y-4">
        <div className="flex bg-[#1a1d26] p-1 rounded-xl border border-gray-800">
          <button
            onClick={() => setStandingsSubTab("standings")}
            className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors ${standingsSubTab === "standings" ? "bg-gray-800 text-white shadow-sm" : "text-gray-500 hover:text-gray-300"}`}
          >
            Standings
          </button>
          <button
            onClick={() => setStandingsSubTab("transactions")}
            className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors ${standingsSubTab === "transactions" ? "bg-gray-800 text-white shadow-sm" : "text-gray-500 hover:text-gray-300"}`}
          >
            Transactions
          </button>
        </div>

        {standingsSubTab === "standings" ? (
          <Card className="gradient-card rounded-xl p-4 border-0">
            <h3 className="text-white font-semibold mb-3">Season Points Standings</h3>
            <div className="overflow-x-auto hide-scrollbar -mx-1 px-1" style={{ WebkitOverflowScrolling: "touch" }}>
              <table className="w-full" style={{ minWidth: "280px" }}>
                <thead>
                  <tr className="border-b border-gray-700">
                    <th className="text-left text-[10px] text-gray-500 font-semibold uppercase pb-1.5 sticky left-0 bg-[#1a1d26] z-10 w-[140px] pl-1">Team</th>
                    <th className="text-center text-[10px] text-yellow-400 font-bold uppercase pb-1.5 w-[70px]">Total Pts</th>
                  </tr>
                </thead>
                <tbody>
                  {standings.map((team, idx) => (
                    <tr key={team.teamId} className="border-b border-gray-800/50 hover:bg-white/[0.02]">
                      {teamCell(team, idx)}
                      <td className="text-center py-2">
                        <p className="text-yellow-400 text-xs font-bold">{(team.totalPoints ?? 0).toFixed(1)}</p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        ) : (
          <Card className="gradient-card rounded-xl p-4 border-0">
            <h3 className="text-white font-semibold mb-1">Recent Transactions</h3>
            <TransactionsList leagueId={leagueId} />
          </Card>
        )}
      </div>
    );
  }

  return (
    <Card className="gradient-card rounded-xl p-4 border-0">
      <h3 className="text-white font-semibold mb-3">Standings</h3>
      <p className="text-gray-400 text-sm">Unknown scoring format</p>
    </Card>
  );
}

const BATTER_POSITIONS = ["All", "C", "1B", "2B", "3B", "SS", "OF", "UT"];
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
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: "asc" | "desc" } | null>(null);

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
    "2026stats": "2026 Stats",
  };

  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (searchExpanded && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [searchExpanded]);

  const handleSort = (cat: string) => {
    setSortConfig(prev => {
      if (prev?.key === cat) {
        return { key: cat, direction: prev.direction === "desc" ? "asc" : "desc" };
      }
      return { key: cat, direction: "desc" };
    });
  };

  const sortedPlayers = (() => {
    if (!data?.players) return [];
    const players = [...data.players] as PlayerWithAdp[];
    if (!sortConfig) return players;

    return players.sort((a, b) => {
      let valA: number;
      let valB: number;

      if (sortConfig.key === "ADP") {
        valA = a.externalAdp ?? (a.adpValue && a.adpValue < 9999 ? a.adpValue : 10000);
        valB = b.externalAdp ?? (b.adpValue && b.adpValue < 9999 ? b.adpValue : 10000);
      } else {
        const strA = getStatValue(a, sortConfig.key);
        const strB = getStatValue(b, sortConfig.key);
        valA = strA === "-" ? -1 : parseFloat(strA);
        valB = strB === "-" ? -1 : parseFloat(strB);
      }

      if (valA === valB) return 0;
      const res = valA > valB ? 1 : -1;
      return sortConfig.direction === "desc" ? -res : res;
    });
  })();

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
          <button
            className="h-[34px] w-10 flex items-center justify-center text-gray-400 hover:text-white bg-gray-800/50 border border-gray-700 rounded-lg transition-colors shrink-0"
            onClick={() => setSearchExpanded(true)}
          >
            <Search className="w-4 h-4" />
          </button>
          <Select value={rosterStatus} onValueChange={(v: "free_agents" | "rostered" | "all") => setRosterStatus(v)}>
            <SelectTrigger className="w-10 h-[34px] bg-gray-800/50 border-gray-700 text-white p-0 flex items-center justify-center rounded-lg [&>svg:last-child]:hidden">
              <Menu className="w-4 h-4" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="free_agents">Free Agents</SelectItem>
              <SelectItem value="rostered">Rostered</SelectItem>
              <SelectItem value="all">All Players</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex bg-gray-800/60 rounded-lg p-0.5 shrink-0 h-[34px] items-center">
            <button
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors h-full flex items-center ${playerType === "batters" ? "bg-blue-600 text-white" : "text-gray-400 hover:text-gray-300"}`}
              onClick={() => { setPlayerType("batters"); setPositionFilter("All"); }}
            >
              Batters
            </button>
            <button
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors h-full flex items-center ${playerType === "pitchers" ? "bg-blue-600 text-white" : "text-gray-400 hover:text-gray-300"}`}
              onClick={() => { setPlayerType("pitchers"); setPositionFilter("All"); }}
            >
              Pitchers
            </button>
          </div>
          <Select value={positionFilter} onValueChange={(v) => setPositionFilter(v)}>
            <SelectTrigger className="w-[72px] h-[34px] bg-gray-800/50 border-gray-700 text-sm text-white rounded-lg">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {posOptions.map(pos => (
                <SelectItem key={pos} value={pos}>{pos}</SelectItem>
              ))}
            </SelectContent>
          </Select>
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
                  {league.type !== "Best Ball" && <th className="w-[24px]" />}
                  <th className="text-left text-[10px] text-gray-500 font-semibold uppercase pb-1.5 pl-1 w-[120px]">Player</th>
                  {statView === "adp" ? (
                    <th 
                      className="text-center text-[10px] text-gray-400 font-semibold uppercase pb-1.5 w-[56px] cursor-pointer hover:text-white transition-colors"
                      onClick={() => handleSort("ADP")}
                    >
                      ADP {sortConfig?.key === "ADP" && (sortConfig.direction === "desc" ? "↓" : "↑")}
                    </th>
                  ) : (
                    activeCats.map(cat => (
                      <th 
                        key={cat} 
                        className="text-center text-[10px] text-gray-400 font-semibold uppercase pb-1.5 w-[48px] cursor-pointer hover:text-white transition-colors"
                        onClick={() => handleSort(cat)}
                      >
                        {cat} {sortConfig?.key === cat && (sortConfig.direction === "desc" ? "↓" : "↑")}
                      </th>
                    ))
                  )}
                </tr>
              </thead>
              <tbody>
                {sortedPlayers.map(player => {
                  const isOnWaivers = waiverPlayerIds.has(player.id);
                  const isRostered = rosteredPlayerIds.has(player.id);
                  const plusColor = isRostered
                    ? "text-red-400 border-red-500/60 hover:bg-red-500/20"
                    : isOnWaivers
                    ? "text-yellow-400 border-yellow-500/60 hover:bg-yellow-500/20"
                    : "text-green-400 border-green-500/60 hover:bg-green-500/20";
                  const isBB = league.type === "Best Ball";
                  return (
                  <tr key={player.id} className="border-b border-gray-800/40 hover:bg-white/[0.02]">
                    {!isBB && (
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
                    )}
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
  const [showSettings, setShowSettings] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editMaxTeams, setEditMaxTeams] = useState("");
  const [editScoringFormat, setEditScoringFormat] = useState("");
  const [editType, setEditType] = useState("");
  const [editStatus, setEditStatus] = useState("");
  const [editLockType, setEditLockType] = useState("Daily");
  const [editLeagueImage, setEditLeagueImage] = useState<string | null>(null);
  const [isEditingRoster, setIsEditingRoster] = useState(false);
  const [editRosterPositions, setEditRosterPositions] = useState<string[]>([]);
  const [editRosterCounts, setEditRosterCounts] = useState<Record<string, number>>({});
  const [editMaxRosterSize, setEditMaxRosterSize] = useState<number>(0);
  const [isEditingDraft, setIsEditingDraft] = useState(false);
  const [editDraftType, setEditDraftType] = useState("");
  const [editDraftDate, setEditDraftDate] = useState("");
  const [editSecondsPerPick, setEditSecondsPerPick] = useState("");
  const [editDraftOrder, setEditDraftOrder] = useState("");
  const [manualTeamOrder, setManualTeamOrder] = useState<number[]>([]);
  const [isRandomizing, setIsRandomizing] = useState(false);
  const [isEditingScoring, setIsEditingScoring] = useState(false);
  const [editHittingCategories, setEditHittingCategories] = useState<string[]>([]);
  const [editPitchingCategories, setEditPitchingCategories] = useState<string[]>([]);
  const [editPointValues, setEditPointValues] = useState<Record<string, number>>({});
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [selectedSwapIndex, setSelectedSwapIndex] = useState<number | null>(null);
  const [swapTargets, setSwapTargets] = useState<number[]>([]);
  const [rosterStatView, setRosterStatView] = useState<"2025stats" | "2026stats" | "2026proj" | "daily">("daily");
  const [dailyDate, setDailyDate] = useState(() => {
    const now = new Date();
    return now.toISOString().split("T")[0];
  });

  const getMonday = (dateStr: string) => {
    const d = new Date(dateStr + "T12:00:00");
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    return d.toISOString().split("T")[0];
  };
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

  const isWeeklyLock = league?.lineupLockType === "Weekly";

  useEffect(() => {
    if (isWeeklyLock) {
      setDailyDate(prev => getMonday(prev));
    }
  }, [isWeeklyLock]);

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

  const { data: dailyLineupData, isLoading: dailyLineupLoading } = useQuery<any[]>({
    queryKey: ["/api/leagues", leagueId, "daily-lineup", dailyDate, myTeam?.id],
    queryFn: async () => {
      if (!myTeam?.id) return [];
      const res = await fetch(`/api/leagues/${leagueId}/daily-lineup?teamId=${myTeam.id}&date=${dailyDate}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: rosterStatView === "daily" && !!myTeam?.id && leagueId !== null,
  });

  const { data: gameTimesData } = useQuery<{ playerId: number; gameTime: string | null; opponent: string | null; isHome: boolean; status: string | null; isLocked: boolean }[]>({
    queryKey: ["/api/leagues", leagueId, "game-times", myTeam?.id, dailyDate],
    queryFn: async () => {
      if (!myTeam?.id) return [];
      const res = await fetch(`/api/leagues/${leagueId}/game-times?teamId=${myTeam.id}&date=${dailyDate}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: rosterStatView === "daily" && !!myTeam?.id && leagueId !== null,
  });

  const saveDailyLineupMut = useMutation({
    mutationFn: async (data: { slotA: number; slotB: number }) => {
      await apiRequest("POST", `/api/leagues/${leagueId}/daily-lineup/swap`, {
        teamId: myTeam?.id,
        date: dailyDate,
        slotIndexA: data.slotA,
        slotIndexB: data.slotB,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "daily-lineup", dailyDate, myTeam?.id] });
      setSelectedSwapIndex(null);
      setSwapTargets([]);
      toast({ title: isWeeklyLock ? "Weekly lineup updated" : "Daily lineup updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to update lineup", description: err.message, variant: "destructive" });
      setSelectedSwapIndex(null);
      setSwapTargets([]);
    },
  });

  const rosterSlots = league?.rosterPositions || [];

  const dailyRosterEntries = (() => {
    if (rosterStatView !== "daily" || !dailyLineupData || dailyLineupData.length === 0) return null;
    const playerMap = new Map(myRosteredPlayers.map(p => [p.id, p]));
    return rosterSlots.map((slotPos, idx) => {
      const lineupEntry = dailyLineupData.find((d: any) => d.slotIndex === idx);
      const player = lineupEntry ? playerMap.get(lineupEntry.playerId) : undefined;
      return {
        slotPos,
        slotIndex: idx,
        player: player || null,
        pickId: lineupEntry?.id || null,
      } as RosterEntry;
    });
  })();

  const bestBallRosterEntries = (() => {
    if (league?.type !== "Best Ball" || !myRosteredPlayers.length) return null;
    const scoringSlots = league?.rosterPositions || [];
    const INF_POS = ["1B", "2B", "3B", "SS"];
    const BB_GROUPS = [
      { label: "C", positions: ["C"], slotKey: "C" },
      { label: "INF", positions: INF_POS, slotKey: "INF" },
      { label: "OF", positions: ["OF", "LF", "CF", "RF"], slotKey: "OF" },
      { label: "SP", positions: ["SP"], slotKey: "SP" },
      { label: "RP", positions: ["RP"], slotKey: "RP" },
    ];

    const entries: RosterEntry[] = [];
    const usedPlayerIds = new Set<number>();
    let idx = 0;

    for (const group of BB_GROUPS) {
      const slotsForGroup = scoringSlots.filter(s => s === group.slotKey).length;
      const playersForGroup = myRosteredPlayers.filter(p => group.positions.includes(p.position));

      for (let s = 0; s < slotsForGroup; s++) {
        const player = playersForGroup.find(p => !usedPlayerIds.has(p.id)) || null;
        if (player) usedPlayerIds.add(player.id);
        entries.push({ player, pickId: null, slotIndex: idx++, slotPos: group.slotKey });
      }

      const extraPlayers = playersForGroup.filter(p => !usedPlayerIds.has(p.id));
      for (const player of extraPlayers) {
        usedPlayerIds.add(player.id);
        entries.push({ player, pickId: null, slotIndex: idx++, slotPos: group.slotKey });
      }
    }

    const unassigned = myRosteredPlayers.filter(p => !usedPlayerIds.has(p.id));
    for (const player of unassigned) {
      const pos = player.position === "DH" ? "INF" : (["SP", "RP"].includes(player.position) ? player.position : "OF");
      entries.push({ player, pickId: null, slotIndex: idx++, slotPos: pos });
    }

    return entries;
  })();

  const rosterEntries = bestBallRosterEntries || dailyRosterEntries || assignPlayersToRosterWithPicks(rosterSlots, myRosteredPlayers, myPicks);

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

  const isPastDate = dailyDate < new Date().toISOString().split("T")[0];

  const handleSwapSelect = (index: number) => {
    if (league?.type === "Best Ball") return;
    if (rosterStatView === "daily") {
      if (isPastDate) {
        toast({ title: "Cannot edit past lineups", description: "You can only change today's or future lineups.", variant: "destructive" });
        return;
      }
      if (gameTimesData) {
        const entry = rosterEntries[index];
        if (entry?.player) {
          const gt = gameTimesData.find(g => g.playerId === (entry.player as any).id);
          if (gt?.isLocked) {
            toast({ title: "Player Locked", description: "This player's game has already started.", variant: "destructive" });
            return;
          }
        }
      }
    }
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
      if (rosterStatView === "daily") {
        const slotA = selectedSwapIndex;
        setSelectedSwapIndex(null);
        setSwapTargets([]);
        saveDailyLineupMut.mutate({ slotA, slotB: index });
        return;
      } else {
        const entryA = rosterEntries[selectedSwapIndex];
        const entryB = rosterEntries[index];
        const swapData = {
          pickIdA: entryA.pickId!,
          slotA: selectedSwapIndex,
          pickIdB: entryB.pickId,
          slotB: index,
        };
        setSelectedSwapIndex(null);
        setSwapTargets([]);
        swapMutation.mutate(swapData);
      }
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
    setEditLockType(league.lineupLockType || "Daily");
    setEditLeagueImage(league.leagueImage || null);
    setIsEditing(true);
  };

  const handleLeagueImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: "Image too large", description: "Please use an image under 2MB", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setEditLeagueImage(reader.result as string);
    reader.readAsDataURL(file);
  };

  const saveSettings = () => {
    updateMutation.mutate({
      maxTeams: parseInt(editMaxTeams),
      numberOfTeams: parseInt(editMaxTeams),
      type: editType,
      status: editStatus,
      isPublic: editStatus === "Public",
      lineupLockType: editLockType,
      leagueImage: editLeagueImage,
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

  const DEFAULT_POINT_VALUES: Record<string, number> = {
    R: 1, HR: 4, RBI: 1, SB: 2, H: 0.5, "2B": 1, "3B": 2, BB: 1, HBP: 1, TB: 0.5, CS: -1,
    W: 5, SV: 5, K: 1, QS: 3, HLD: 2, SO: 1, L: -2, CG: 3, SHO: 5, BSV: -2,
  };

  const HITTING_POINT_STATS = ["R", "HR", "RBI", "SB", "H", "2B", "3B", "BB", "HBP", "TB", "CS"];
  const PITCHING_POINT_STATS = ["W", "SV", "K", "QS", "HLD", "SO", "L", "CG", "SHO", "BSV"];

  const startEditingScoring = () => {
    if (!league) return;
    setEditScoringFormat(league.scoringFormat || "Roto");
    setEditHittingCategories(league.hittingCategories || ["R", "HR", "RBI", "SB", "AVG"]);
    setEditPitchingCategories(league.pitchingCategories || ["W", "SV", "K", "ERA", "WHIP"]);
    const existingPV = league.pointValues ? (() => { try { return JSON.parse(league.pointValues); } catch { return {}; } })() : {};
    setEditPointValues({ ...DEFAULT_POINT_VALUES, ...existingPV });
    setIsEditingScoring(true);
  };

  const saveScoringSettings = () => {
    const isPointsFormat = editScoringFormat === "H2H Points" || editScoringFormat === "Season Points";
    updateMutation.mutate({
      scoringFormat: editScoringFormat,
      hittingCategories: editHittingCategories,
      pitchingCategories: editPitchingCategories,
      ...(isPointsFormat ? { pointValues: JSON.stringify(editPointValues) } : {}),
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "standings"] });
        queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "matchups"] });
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
    setEditRosterPositions(positions);
    setEditRosterCounts(positionsToCountsMap(positions));
    setEditMaxRosterSize(league.maxRosterSize || positions.length);
    setIsEditingRoster(true);
  };

  const saveRosterSettings = () => {
    const positions = countsToPositionsArray(editRosterCounts);
    const isBB = league?.type === "Best Ball";
    const updates: Record<string, unknown> = { rosterPositions: positions };
    if (isBB) {
      updates.maxRosterSize = editMaxRosterSize;
    }
    updateMutation.mutate(updates);
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
    const sorted = [...(teams || [])].sort((a, b) => (a.draftPosition || 999) - (b.draftPosition || 999));
    setManualTeamOrder(sorted.map(t => t.id));
    setIsEditingDraft(true);
  };

  const handleRandomizeDraftOrder = async () => {
    if (!league || !user) return;
    setIsRandomizing(true);
    try {
      await apiRequest("POST", `/api/leagues/${leagueId}/randomize-draft-order`, { userId: user.id });
      queryClient.invalidateQueries({ queryKey: ["/api/teams/league", leagueId] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId] });
      setEditDraftOrder("Random");
      toast({ title: "Draft order randomized!" });
    } catch (err) {
      toast({ title: "Failed to randomize", variant: "destructive" });
    }
    setIsRandomizing(false);
  };

  const handleSaveManualOrder = async () => {
    if (!league || !user) return;
    try {
      await apiRequest("POST", `/api/leagues/${leagueId}/set-draft-order`, {
        userId: user.id,
        teamOrder: manualTeamOrder,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/teams/league", leagueId] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId] });
      toast({ title: "Draft order saved!" });
    } catch (err) {
      toast({ title: "Failed to save draft order", variant: "destructive" });
    }
  };

  const moveTeamUp = (index: number) => {
    if (index <= 0) return;
    const newOrder = [...manualTeamOrder];
    [newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]];
    setManualTeamOrder(newOrder);
  };

  const moveTeamDown = (index: number) => {
    if (index >= manualTeamOrder.length - 1) return;
    const newOrder = [...manualTeamOrder];
    [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];
    setManualTeamOrder(newOrder);
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

  const ALL_POSITIONS = ["C", "INF", "1B", "2B", "3B", "SS", "OF", "UT", "DH", "SP", "RP", "P", "BN", "IL"];

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

  const isH2H = league.scoringFormat?.startsWith("H2H");
  const isBestBall = league.type === "Best Ball";
  const tabs: { key: Tab; label: string }[] = [
    { key: "roster", label: "Roster" },
    ...(isH2H ? [{ key: "matchup" as Tab, label: "Matchup" }] : []),
    { key: "players", label: "Players" },
    { key: "standings", label: "Standings" },
  ];

  return (
    <div className="px-4 py-4">
      <div className="flex items-center justify-between mb-4">
        <Button
          onClick={() => setLocation("/teams")}
          variant="ghost"
          size="icon"
          className="text-gray-400 hover:text-white shrink-0 -ml-2 h-9 w-9"
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>

        <div className="flex-1 flex justify-center min-w-0 px-2">
          <div className="bg-white/5 border border-white/10 px-4 py-1.5 rounded-full shadow-inner backdrop-blur-sm max-w-full">
            <h1 className="text-sm font-bold text-white truncate tracking-wide uppercase">{league.name}</h1>
          </div>
        </div>

        <Button
          onClick={() => setShowSettings(!showSettings)}
          variant="ghost"
          size="icon"
          className={`shrink-0 h-9 w-9 rounded-full ${showSettings ? "text-blue-400 bg-white/10" : "text-gray-400 hover:text-white"}`}
        >
          <Settings className="w-5 h-5" />
        </Button>
      </div>

      <div className="mb-4">
        {league.description && (
          <p className="text-gray-400 text-sm text-center">{league.description}</p>
        )}
      </div>

      <div className="flex border-b border-gray-700 mb-4">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => { setActiveTab(tab.key); setShowSettings(false); }}
            className={`flex-1 py-2.5 text-sm font-medium text-center transition-colors ${
              activeTab === tab.key && !showSettings
                ? "text-blue-400 border-b-2 border-blue-400"
                : "text-gray-400 hover:text-gray-300"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "roster" && !showSettings && (
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

          {!isBestBall && myClaimsData && myClaimsData.length > 0 && (
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
                        <div className="text-right shrink-0 mr-2">
                          <p className="text-[10px] text-gray-400">Expires</p>
                          <p className="text-[10px] text-yellow-400 font-medium">
                            {claim.waiver?.waiverExpiresAt
                              ? new Date(claim.waiver.waiverExpiresAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                              : "—"}
                          </p>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            cancelClaimMut.mutate(claim.id);
                          }}
                          disabled={cancelClaimMut.isPending}
                          className="w-6 h-6 rounded-full bg-red-600/20 hover:bg-red-600/40 flex items-center justify-center shrink-0 transition-colors"
                          title="Cancel claim"
                        >
                          <X className="w-3 h-3 text-red-400" />
                        </button>
                      </div>
                    ))}
                  </div>
                </SelectContent>
              </Select>
            </div>
          )}

          {isBestBall && (
            <Card className="gradient-card rounded-xl p-4 border-0 mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-yellow-600/20 flex items-center justify-center shrink-0">
                  <Trophy className="w-5 h-5 text-yellow-400" />
                </div>
                <div>
                  <p className="text-white font-semibold text-sm">Best Ball League</p>
                  <p className="text-gray-400 text-xs">No lineup management, waivers, or trades. Optimal lineups are calculated at season end.</p>
                </div>
              </div>
            </Card>
          )}

          {myTeam ? (() => {
            const isPitcherSlot = (s: string) => s === "SP" || s === "RP" || s === "P";
            const isPitcherPlayer = (p: Player) => ["SP", "RP", "P"].includes(p.position);

            const posEntries = isBestBall
              ? rosterEntries.filter(e => !isPitcherSlot(e.slotPos))
              : rosterEntries.filter(e => !isPitcherSlot(e.slotPos) && e.slotPos !== "BN" && e.slotPos !== "IL");
            const pitchEntries = isBestBall
              ? rosterEntries.filter(e => isPitcherSlot(e.slotPos))
              : rosterEntries.filter(e => isPitcherSlot(e.slotPos));
            
            const benchPosEntries = isBestBall ? [] : rosterEntries.filter(e => (e.slotPos === "BN" || e.slotPos === "IL") && e.player && !isPitcherPlayer(e.player));
            const benchPitchEntries = isBestBall ? [] : rosterEntries.filter(e => (e.slotPos === "BN" || e.slotPos === "IL") && e.player && isPitcherPlayer(e.player));
            const emptyBenchEntries = isBestBall ? [] : rosterEntries.filter(e => (e.slotPos === "BN" || e.slotPos === "IL") && !e.player);
            
            const isDraftCompleted = league.draftStatus === "completed";

            const STAT_COL = "w-[42px] text-center text-[11px] shrink-0";

            const statPrefix = rosterStatView === "2026proj" ? "proj" : (rosterStatView === "2026stats" || rosterStatView === "daily") ? "s26" : "stat";

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
                      <Badge className="text-[10px] px-1.5 py-0 shrink-0 bg-yellow-600 text-white border-0">
                        Commish
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {!isBestBall && selectedSwapIndex !== null && (
                      <Button
                        onClick={() => { setSelectedSwapIndex(null); setSwapTargets([]); }}
                        variant="ghost"
                        size="sm"
                        className="text-gray-400 hover:text-white h-7 px-2 text-xs"
                      >
                        Cancel Swap
                      </Button>
                    )}
                    <Select value={rosterStatView} onValueChange={(v) => { setRosterStatView(v as "2025stats" | "2026stats" | "2026proj" | "daily"); setSelectedSwapIndex(null); setSwapTargets([]); }}>
                      <SelectTrigger className="h-6 w-[110px] text-[10px] bg-gray-800/50 border-gray-700 text-gray-400 hover:text-gray-200 transition-colors">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-gray-800 border-gray-700">
                        {!isBestBall && (
                          <SelectItem value="daily" className="text-[10px] text-gray-200">{isWeeklyLock ? "Weekly" : "Daily"}</SelectItem>
                        )}
                        <SelectItem value="2025stats" className="text-[10px] text-gray-200">2025 Stats</SelectItem>
                        <SelectItem value="2026stats" className="text-[10px] text-gray-200">2026 Stats</SelectItem>
                        <SelectItem value="2026proj" className="text-[10px] text-gray-200">2026 Projections</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {!isBestBall && selectedSwapIndex !== null && (
                  <p className="text-blue-400 text-xs mb-3 px-1">Tap a highlighted slot to swap players</p>
                )}
                {!isBestBall && <div className="flex items-center justify-between mb-3 px-2">
                  <button
                    onClick={() => {
                      const d = new Date(dailyDate + "T12:00:00");
                      d.setDate(d.getDate() - (isWeeklyLock ? 7 : 1));
                      setDailyDate(d.toISOString().split("T")[0]);
                      setSelectedSwapIndex(null);
                      setSwapTargets([]);
                    }}
                    className="p-1 text-gray-400 hover:text-white transition-colors flex-shrink-0"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <div className="flex-1 text-center overflow-hidden">
                    {isWeeklyLock ? (() => {
                      const mon = new Date(dailyDate + "T12:00:00");
                      const sun = new Date(mon);
                      sun.setDate(sun.getDate() + 6);
                      const todayStr = new Date().toISOString().split("T")[0];
                      const isCurrentWeek = todayStr >= dailyDate && todayStr <= sun.toISOString().split("T")[0];
                      const isPastWeek = sun.toISOString().split("T")[0] < todayStr;
                      return (
                        <span className={`text-sm font-semibold whitespace-nowrap ${isPastWeek ? "text-gray-500" : "text-white"}`}>
                          {mon.toLocaleDateString("en-US", { month: "short", day: "numeric" })} - {sun.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          {isCurrentWeek && " (THIS WEEK)"}
                          {isPastWeek && " (LOCKED)"}
                        </span>
                      );
                    })() : (
                      <span className={`text-sm font-semibold whitespace-nowrap ${isPastDate ? "text-gray-500" : "text-white"}`}>
                        {new Date(dailyDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
                        {dailyDate === new Date().toISOString().split("T")[0] && " (TODAY)"}
                        {isPastDate && " (LOCKED)"}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      const d = new Date(dailyDate + "T12:00:00");
                      d.setDate(d.getDate() + (isWeeklyLock ? 7 : 1));
                      setDailyDate(d.toISOString().split("T")[0]);
                      setSelectedSwapIndex(null);
                      setSwapTargets([]);
                    }}
                    className="p-1 text-gray-400 hover:text-white transition-colors flex-shrink-0"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>}
                {!isBestBall && rosterStatView === "daily" && dailyLineupLoading && (
                  <div className="text-center text-gray-400 text-xs py-4">{isWeeklyLock ? "Loading weekly lineup..." : "Loading daily lineup..."}</div>
                )}
                <div className="space-y-5">
                  {posEntries.length > 0 && (
                    <div>
                      <div className="overflow-x-auto hide-scrollbar -mx-1 px-1" style={{ WebkitOverflowScrolling: "touch" }}>
                        <table className="w-full" style={{ minWidth: Math.max(300, 200 + leagueHittingCats.length * 52) + "px" }}>
                          <thead>
                            <tr className="border-b border-gray-700">
                              <th className="text-left text-[10px] text-gray-500 font-semibold uppercase pb-1.5 w-9 pl-1">Pos</th>
                              <th className="text-left text-[10px] text-gray-500 font-semibold uppercase pb-1.5 w-[140px]">Player</th>
                              <th className="text-left text-[10px] text-gray-500 font-semibold uppercase pb-1.5 w-[70px]">Game</th>
                              {leagueHittingCats.map(stat => (
                                <th key={stat} className={`${STAT_COL} text-gray-400 font-semibold pb-1.5`}>{stat}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {posEntries.map(entry => {
                              const p = entry.player as Record<string, unknown> | null;
                              const gt = rosterStatView === "daily" && gameTimesData && p 
                                ? gameTimesData.find(g => g.playerId === (p.id as number)) 
                                : null;

                              return (
                                <tr key={entry.slotIndex} className={getRowClass(entry.slotIndex)}>
                                  <td className="py-1.5 pl-1">
                                    <button
                                      onClick={() => handleSwapSelect(entry.slotIndex)}
                                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded transition-colors ${
                                        selectedSwapIndex === entry.slotIndex 
                                          ? "bg-blue-600 text-white" 
                                          : swapTargets.includes(entry.slotIndex)
                                            ? "bg-green-600 text-white animate-pulse"
                                            : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                                      }`}
                                    >
                                      {entry.slotPos}
                                    </button>
                                  </td>
                                  <td className="py-1.5 pr-2">
                                    {p ? (
                                      <div className="cursor-pointer" onClick={() => isDraftCompleted && p && handleSwapSelect(entry.slotIndex)}>
                                        <p className="text-white text-xs font-medium truncate max-w-[130px]">{p.name as string}</p>
                                        <p className="text-gray-500 text-[10px]">{p.position as string} — {(p.teamAbbreviation || p.team) as string}</p>
                                      </div>
                                    ) : (
                                      <div className="cursor-pointer" onClick={() => isDraftCompleted && handleSwapSelect(entry.slotIndex)}>
                                        <p className="text-gray-600 text-xs italic">Empty</p>
                                      </div>
                                    )}
                                  </td>
                                  <td className="py-1.5">
                                    {gt ? (
                                      <div className="text-[9px] leading-tight">
                                        {!gt.gameTime ? (
                                          <p className="text-gray-500 italic">No Game</p>
                                        ) : (
                                          <p className="text-gray-400">
                                            {gt.isHome ? "vs" : "@"} {gt.opponent}
                                            <br />
                                            {new Date(gt.gameTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                                            {gt.isLocked ? " 🔒" : ""}
                                          </p>
                                        )}
                                      </div>
                                    ) : (
                                      <span className="text-gray-600">-</span>
                                    )}
                                  </td>
                                  {leagueHittingCats.map(stat => (
                                    <td key={stat} className={`${STAT_COL} text-gray-300`}>{p ? (p[`${statPrefix}${stat}`] as string ?? "-") : "-"}</td>
                                  ))}
                                </tr>
                              );
                            })}
                            {benchPosEntries.map(entry => {
                              const p = entry.player as Record<string, unknown> | null;
                              const gt = rosterStatView === "daily" && gameTimesData && p 
                                ? gameTimesData.find(g => g.playerId === (p.id as number)) 
                                : null;

                              return (
                                <tr key={entry.slotIndex} className={getRowClass(entry.slotIndex)}>
                                  <td className="py-1.5 pl-1">
                                    <button
                                      onClick={() => handleSwapSelect(entry.slotIndex)}
                                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded transition-colors ${
                                        selectedSwapIndex === entry.slotIndex 
                                          ? "bg-blue-600 text-white" 
                                          : swapTargets.includes(entry.slotIndex)
                                            ? "bg-green-600 text-white animate-pulse"
                                            : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                                      }`}
                                    >
                                      {entry.slotPos}
                                    </button>
                                  </td>
                                  <td className="py-1.5 pr-2">
                                    <div className="cursor-pointer" onClick={() => isDraftCompleted && p && handleSwapSelect(entry.slotIndex)}>
                                      <p className="text-white text-xs font-medium truncate max-w-[130px]">{p?.name as string}</p>
                                      <p className="text-gray-500 text-[10px]">{p?.position as string} — {(p?.teamAbbreviation || p?.team) as string}</p>
                                    </div>
                                  </td>
                                  <td className="py-1.5">
                                    {gt ? (
                                      <div className="text-[9px] leading-tight">
                                        {!gt.gameTime ? (
                                          <p className="text-gray-500 italic">No Game</p>
                                        ) : (
                                          <p className="text-gray-400">
                                            {gt.isHome ? "vs" : "@"} {gt.opponent}
                                            <br />
                                            {new Date(gt.gameTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                                            {gt.isLocked ? " 🔒" : ""}
                                          </p>
                                        )}
                                      </div>
                                    ) : (
                                      <span className="text-gray-600">-</span>
                                    )}
                                  </td>
                                  {leagueHittingCats.map(stat => (
                                    <td key={stat} className={`${STAT_COL} text-gray-500 opacity-60`}>{p ? (p[`${statPrefix}${stat}`] as string ?? "-") : "-"}</td>
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
                      <div className="overflow-x-auto hide-scrollbar -mx-1 px-1" style={{ WebkitOverflowScrolling: "touch" }}>
                        <table className="w-full" style={{ minWidth: Math.max(300, 200 + leaguePitchingCats.length * 52) + "px" }}>
                          <thead>
                            <tr className="border-b border-gray-700">
                              <th className="text-left text-[10px] text-gray-500 font-semibold uppercase pb-1.5 w-9 pl-1">Pos</th>
                              <th className="text-left text-[10px] text-gray-500 font-semibold uppercase pb-1.5 w-[140px]">Player</th>
                              <th className="text-left text-[10px] text-gray-500 font-semibold uppercase pb-1.5 w-[70px]">Game</th>
                              {leaguePitchingCats.map(stat => (
                                <th key={stat} className={`${STAT_COL} text-gray-400 font-semibold pb-1.5`}>{stat}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {pitchEntries.map(entry => {
                              const p = entry.player as Record<string, unknown> | null;
                              const gt = rosterStatView === "daily" && gameTimesData && p 
                                ? gameTimesData.find(g => g.playerId === (p.id as number)) 
                                : null;

                              return (
                                <tr key={entry.slotIndex} className={getRowClass(entry.slotIndex)}>
                                  <td className="py-1.5 pl-1">
                                    <button
                                      onClick={() => handleSwapSelect(entry.slotIndex)}
                                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded transition-colors ${
                                        selectedSwapIndex === entry.slotIndex 
                                          ? "bg-blue-600 text-white" 
                                          : swapTargets.includes(entry.slotIndex)
                                            ? "bg-green-600 text-white animate-pulse"
                                            : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                                      }`}
                                    >
                                      {entry.slotPos}
                                    </button>
                                  </td>
                                  <td className="py-1.5 pr-2">
                                    {p ? (
                                      <div className="cursor-pointer" onClick={() => isDraftCompleted && p && handleSwapSelect(entry.slotIndex)}>
                                        <p className="text-white text-xs font-medium truncate max-w-[130px]">{p.name as string}</p>
                                        <p className="text-gray-500 text-[10px]">{p.position as string} — {(p.teamAbbreviation || p.team) as string}</p>
                                      </div>
                                    ) : (
                                      <div className="cursor-pointer" onClick={() => isDraftCompleted && handleSwapSelect(entry.slotIndex)}>
                                        <p className="text-gray-600 text-xs italic">Empty</p>
                                      </div>
                                    )}
                                  </td>
                                  <td className="py-1.5">
                                    {gt ? (
                                      <div className="text-[9px] leading-tight">
                                        {!gt.gameTime ? (
                                          <p className="text-gray-500 italic">No Game</p>
                                        ) : (
                                          <p className="text-gray-400">
                                            {gt.isHome ? "vs" : "@"} {gt.opponent}
                                            <br />
                                            {new Date(gt.gameTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                                            {gt.isLocked ? " 🔒" : ""}
                                          </p>
                                        )}
                                      </div>
                                    ) : (
                                      <span className="text-gray-600">-</span>
                                    )}
                                  </td>
                                  {leaguePitchingCats.map(stat => (
                                    <td key={stat} className={`${STAT_COL} text-gray-300`}>{p ? (p[`${statPrefix}${stat}`] as string ?? "-") : "-"}</td>
                                  ))}
                                </tr>
                              );
                            })}
                            {benchPitchEntries.map(entry => {
                              const p = entry.player as Record<string, unknown> | null;
                              const gt = rosterStatView === "daily" && gameTimesData && p 
                                ? gameTimesData.find(g => g.playerId === (p.id as number)) 
                                : null;

                              return (
                                <tr key={entry.slotIndex} className={getRowClass(entry.slotIndex)}>
                                  <td className="py-1.5 pl-1">
                                    <button
                                      onClick={() => handleSwapSelect(entry.slotIndex)}
                                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded transition-colors ${
                                        selectedSwapIndex === entry.slotIndex 
                                          ? "bg-blue-600 text-white" 
                                          : swapTargets.includes(entry.slotIndex)
                                            ? "bg-green-600 text-white animate-pulse"
                                            : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                                      }`}
                                    >
                                      {entry.slotPos}
                                    </button>
                                  </td>
                                  <td className="py-1.5 pr-2">
                                    <div className="cursor-pointer" onClick={() => isDraftCompleted && p && handleSwapSelect(entry.slotIndex)}>
                                      <p className="text-white text-xs font-medium truncate max-w-[130px]">{p?.name as string}</p>
                                      <p className="text-gray-500 text-[10px]">{p?.position as string} — {(p?.teamAbbreviation || p?.team) as string}</p>
                                    </div>
                                  </td>
                                  <td className="py-1.5">
                                    {gt ? (
                                      <div className="text-[9px] leading-tight">
                                        {!gt.gameTime ? (
                                          <p className="text-gray-500 italic">No Game</p>
                                        ) : (
                                          <p className="text-gray-400">
                                            {gt.isHome ? "vs" : "@"} {gt.opponent}
                                            <br />
                                            {new Date(gt.gameTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                                            {gt.isLocked ? " 🔒" : ""}
                                          </p>
                                        )}
                                      </div>
                                    ) : (
                                      <span className="text-gray-600">-</span>
                                    )}
                                  </td>
                                  {leaguePitchingCats.map(stat => (
                                    <td key={stat} className={`${STAT_COL} text-gray-500 opacity-60`}>{p ? (p[`${statPrefix}${stat}`] as string ?? "-") : "-"}</td>
                                  ))}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {emptyBenchEntries.length > 0 && (
                        <div className="space-y-1">
                          {emptyBenchEntries.map(entry => {
                            const isTarget = swapTargets.includes(entry.slotIndex);
                            const isSelected = selectedSwapIndex === entry.slotIndex;
                            return (
                              <div
                                key={entry.slotIndex}
                                className={`flex items-center gap-2 py-1.5 rounded px-1 transition-colors ${
                                  isSelected ? "bg-blue-900/30 ring-1 ring-blue-500/50" : isTarget ? "bg-green-900/20 ring-1 ring-green-500/30 cursor-pointer" : ""
                                }`}
                              >
                                <button
                                  onClick={() => handleSwapSelect(entry.slotIndex)}
                                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 transition-colors ${
                                    isSelected 
                                      ? "bg-blue-600 text-white" 
                                      : isTarget
                                        ? "bg-green-600 text-white animate-pulse"
                                        : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                                  }`}
                                >
                                  {entry.slotPos}
                                </button>
                                <div className="min-w-0" onClick={() => isDraftCompleted && handleSwapSelect(entry.slotIndex)}>
                                  <p className="text-gray-600 text-xs italic">Empty</p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                  )}
                </div>
              </div>
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

      {activeTab === "matchup" && !showSettings && <MatchupTab leagueId={leagueId!} league={league!} user={user} />}

      {activeTab === "players" && !showSettings && <PlayersTab leagueId={leagueId!} league={league!} user={user} />}

      {activeTab === "standings" && !showSettings && <StandingsTab leagueId={leagueId!} league={league!} teamsLoading={teamsLoading} teams={teams} user={user} />}

      {showSettings && (
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
                    min="2"
                    max="30"
                    value={editMaxTeams}
                    onChange={(e) => setEditMaxTeams(e.target.value)}
                    className="bg-gray-800 border-gray-700 text-white text-sm h-9"
                  />
                </div>
                <div>
                  <label className="text-gray-400 text-xs block mb-1">League Type</label>
                  <Select value={editType} onValueChange={(val) => {
                    setEditType(val);
                    if (val === "Best Ball" && editScoringFormat !== "Roto" && editScoringFormat !== "Season Points") {
                      setEditScoringFormat("Roto");
                    }
                  }}>
                    <SelectTrigger className="bg-gray-800 border-gray-700 text-white text-sm h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Redraft">Redraft</SelectItem>
                      <SelectItem value="Best Ball">Best Ball</SelectItem>
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
                {editType !== "Best Ball" && (
                <div>
                  <label className="text-gray-400 text-xs block mb-1">Lineup Lock</label>
                  <Select value={editLockType} onValueChange={setEditLockType}>
                    <SelectTrigger className="bg-gray-800 border-gray-700 text-white text-sm h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Daily">Daily Lock (at game start)</SelectItem>
                      <SelectItem value="Weekly">Weekly Lock (Mon game start)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                )}
                <div>
                  <label className="text-gray-400 text-xs block mb-1">League Photo</label>
                  <div className="flex items-center gap-3">
                    {editLeagueImage ? (
                      <img src={editLeagueImage} alt="League" className="w-12 h-12 rounded-lg object-cover" />
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-gray-700 flex items-center justify-center">
                        <Trophy className="w-6 h-6 text-gray-500" />
                      </div>
                    )}
                    <div className="flex gap-2">
                      <label className="cursor-pointer bg-gray-700 hover:bg-gray-600 text-white text-xs px-3 py-1.5 rounded-md transition-colors">
                        Upload
                        <input type="file" accept="image/*" className="hidden" onChange={handleLeagueImageUpload} />
                      </label>
                      {editLeagueImage && (
                        <button
                          onClick={() => setEditLeagueImage(null)}
                          className="text-red-400 hover:text-red-300 text-xs px-2 py-1.5"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
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
                {league.type !== "Best Ball" && (
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-blue-400" />
                  <div>
                    <p className="text-gray-400 text-xs">Lineup Lock</p>
                    <p className="text-white font-medium text-sm">{league.lineupLockType || "Daily"}</p>
                  </div>
                </div>
                )}
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
                      {(editType || league?.type) !== "Best Ball" && (
                        <>
                          <SelectItem value="H2H Points">H2H Points</SelectItem>
                          <SelectItem value="H2H Each Category">H2H Each Category</SelectItem>
                          <SelectItem value="H2H Most Categories">H2H Most Categories</SelectItem>
                        </>
                      )}
                      <SelectItem value="Season Points">Season Points</SelectItem>
                    </SelectContent>
                  </Select>
                  {(editType || league?.type) === "Best Ball" && (
                    <p className="text-xs text-yellow-400 mt-1">Best Ball leagues only support Roto and Season Points scoring</p>
                  )}
                </div>
                {(editScoringFormat === "Roto" || editScoringFormat === "H2H Each Category" || editScoringFormat === "H2H Most Categories") && (
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
                {(editScoringFormat === "H2H Points" || editScoringFormat === "Season Points") && (
                  <>
                    <div>
                      <label className="text-white text-sm font-medium block mb-2">Hitting Point Values</label>
                      <div className="space-y-2">
                        {HITTING_POINT_STATS.map(stat => (
                          <div key={stat} className="flex items-center justify-between bg-gray-800 rounded-lg px-3 py-2">
                            <span className="text-gray-300 text-sm">{STAT_LABELS[stat] || stat} ({stat})</span>
                            <input
                              type="number"
                              step="0.5"
                              value={editPointValues[stat] ?? DEFAULT_POINT_VALUES[stat] ?? 0}
                              onChange={(e) => setEditPointValues(prev => ({ ...prev, [stat]: parseFloat(e.target.value) || 0 }))}
                              className="w-20 bg-gray-700 border border-gray-600 text-white text-sm text-center rounded px-2 py-1 focus:border-blue-500 focus:outline-none"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="text-white text-sm font-medium block mb-2">Pitching Point Values</label>
                      <div className="space-y-2">
                        {PITCHING_POINT_STATS.map(stat => (
                          <div key={stat} className="flex items-center justify-between bg-gray-800 rounded-lg px-3 py-2">
                            <span className="text-gray-300 text-sm">{STAT_LABELS[stat] || stat} ({stat})</span>
                            <input
                              type="number"
                              step="0.5"
                              value={editPointValues[stat] ?? DEFAULT_POINT_VALUES[stat] ?? 0}
                              onChange={(e) => setEditPointValues(prev => ({ ...prev, [stat]: parseFloat(e.target.value) || 0 }))}
                              className="w-20 bg-gray-700 border border-gray-600 text-white text-sm text-center rounded px-2 py-1 focus:border-green-500 focus:outline-none"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditPointValues({ ...DEFAULT_POINT_VALUES })}
                      className="text-xs text-blue-400 hover:text-blue-300 underline"
                    >
                      Reset to defaults
                    </button>
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
                {["Roto", "H2H Each Category", "H2H Most Categories"].includes(league.scoringFormat || "Roto") && (
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
                {["H2H Points", "Season Points"].includes(league.scoringFormat || "Roto") && (() => {
                  const pv = league.pointValues ? (() => { try { return { ...DEFAULT_POINT_VALUES, ...JSON.parse(league.pointValues) }; } catch { return DEFAULT_POINT_VALUES; } })() : DEFAULT_POINT_VALUES;
                  return (
                    <>
                      <div>
                        <p className="text-gray-400 text-xs mb-2">Hitting Point Values</p>
                        <div className="flex flex-wrap gap-1.5">
                          {HITTING_POINT_STATS.map(stat => (
                            <span key={stat} className="px-2 py-1 bg-blue-600/20 text-blue-400 rounded text-xs font-medium">
                              {stat}: {pv[stat] ?? 0}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="text-gray-400 text-xs mb-2">Pitching Point Values</p>
                        <div className="flex flex-wrap gap-1.5">
                          {PITCHING_POINT_STATS.map(stat => (
                            <span key={stat} className="px-2 py-1 bg-green-600/20 text-green-400 rounded text-xs font-medium">
                              {stat}: {pv[stat] ?? 0}
                            </span>
                          ))}
                        </div>
                      </div>
                    </>
                  );
                })()}
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
              {["Roto", "H2H Each Category", "H2H Most Categories"].includes(league.scoringFormat || "Roto") && (
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
              {["H2H Points", "Season Points"].includes(league.scoringFormat || "Roto") && (() => {
                const pv = league.pointValues ? (() => { try { return { ...DEFAULT_POINT_VALUES, ...JSON.parse(league.pointValues) }; } catch { return DEFAULT_POINT_VALUES; } })() : DEFAULT_POINT_VALUES;
                return (
                  <>
                    <div>
                      <p className="text-gray-400 text-xs mb-2">Hitting Point Values</p>
                      <div className="flex flex-wrap gap-1.5">
                        {HITTING_POINT_STATS.map(stat => (
                          <span key={stat} className="px-2 py-1 bg-blue-600/20 text-blue-400 rounded text-xs font-medium">
                            {stat}: {pv[stat] ?? 0}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-gray-400 text-xs mb-2">Pitching Point Values</p>
                      <div className="flex flex-wrap gap-1.5">
                        {PITCHING_POINT_STATS.map(stat => (
                          <span key={stat} className="px-2 py-1 bg-green-600/20 text-green-400 rounded text-xs font-medium">
                            {stat}: {pv[stat] ?? 0}
                          </span>
                        ))}
                      </div>
                    </div>
                  </>
                );
              })()}
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
                {(isBestBall ? ["C", "INF", "OF", "SP", "RP"] : ALL_POSITIONS).map((pos) => (
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
                {isBestBall && (
                  <>
                    <div className="border-t border-gray-700 my-2" />
                    <div className="flex items-center justify-between py-1.5 px-2 rounded-lg bg-gray-800/50">
                      <span className="text-white text-sm font-medium">Total Roster</span>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => setEditMaxRosterSize(prev => Math.max(Object.values(editRosterCounts).reduce((a, b) => a + b, 0), prev - 1))}
                          className="w-7 h-7 rounded-full bg-gray-700 hover:bg-gray-600 text-white flex items-center justify-center text-sm font-bold"
                        >
                          −
                        </button>
                        <span className="text-white text-sm font-semibold w-5 text-center">
                          {editMaxRosterSize}
                        </span>
                        <button
                          type="button"
                          onClick={() => setEditMaxRosterSize(prev => prev + 1)}
                          className="w-7 h-7 rounded-full bg-gray-700 hover:bg-gray-600 text-white flex items-center justify-center text-sm font-bold"
                        >
                          +
                        </button>
                      </div>
                    </div>
                    <p className="text-gray-500 text-xs px-2">
                      {Object.values(editRosterCounts).reduce((a, b) => a + b, 0)} scoring slots, {editMaxRosterSize} total drafted per team
                    </p>
                  </>
                )}
              </div>
            ) : (
              <div>
                <div className="flex flex-wrap gap-1.5">
                  {(league.rosterPositions || []).map((pos, index) => (
                    <Badge key={index} className="bg-gray-700 text-white text-xs px-2 py-0.5">
                      {pos}
                    </Badge>
                  ))}
                </div>
                {isBestBall && league.maxRosterSize && (
                  <p className="text-gray-500 text-xs mt-2">
                    {(league.rosterPositions || []).length} scoring slots, {league.maxRosterSize} total drafted per team
                  </p>
                )}
              </div>
            )
          ) : (
            <div>
              <div className="flex flex-wrap gap-1.5">
                {(league.rosterPositions || []).map((pos, index) => (
                  <Badge key={index} className="bg-gray-700 text-white text-xs px-2 py-0.5">
                    {pos}
                  </Badge>
                ))}
              </div>
              {isBestBall && league.maxRosterSize && (
                <p className="text-gray-500 text-xs mt-2">
                  {(league.rosterPositions || []).length} scoring slots, {league.maxRosterSize} total drafted per team
                </p>
              )}
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
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant={editDraftOrder === "Random" ? "default" : "outline"}
                      className={editDraftOrder === "Random" ? "bg-primary text-white" : "border-gray-700 text-gray-300"}
                      onClick={() => {
                        setEditDraftOrder("Random");
                        handleRandomizeDraftOrder();
                      }}
                      disabled={isRandomizing}
                    >
                      <Shuffle className="w-3.5 h-3.5 mr-1.5" />
                      {isRandomizing ? "Shuffling..." : "Random"}
                    </Button>
                    <Button
                      size="sm"
                      variant={editDraftOrder === "Manual" ? "default" : "outline"}
                      className={editDraftOrder === "Manual" ? "bg-primary text-white" : "border-gray-700 text-gray-300"}
                      onClick={() => {
                        setEditDraftOrder("Manual");
                        const sorted = [...(teams || [])].sort((a, b) => (a.draftPosition || 999) - (b.draftPosition || 999));
                        setManualTeamOrder(sorted.map(t => t.id));
                      }}
                    >
                      <GripVertical className="w-3.5 h-3.5 mr-1.5" />
                      Manual
                    </Button>
                  </div>
                </div>
                {editDraftOrder === "Manual" && (
                  <div>
                    <label className="text-gray-400 text-xs block mb-2">Use arrows to set pick order</label>
                    <div className="space-y-1">
                      {manualTeamOrder.map((teamId, index) => {
                        const team = teams?.find(t => t.id === teamId);
                        return (
                          <div key={teamId} className="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-2">
                            <span className="text-primary font-bold text-xs w-5">{index + 1}</span>
                            <span className="text-white text-sm flex-1">{team?.name || "Unknown"}{team?.isCpu ? " (CPU)" : ""}</span>
                            <div className="flex gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 w-6 p-0 text-gray-400 hover:text-white"
                                onClick={() => moveTeamUp(index)}
                                disabled={index === 0}
                              >
                                <ChevronUp className="w-4 h-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 w-6 p-0 text-gray-400 hover:text-white"
                                onClick={() => moveTeamDown(index)}
                                disabled={index >= manualTeamOrder.length - 1}
                              >
                                <ChevronDown className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <Button
                      size="sm"
                      className="mt-2 bg-primary text-white w-full"
                      onClick={handleSaveManualOrder}
                    >
                      Save Draft Order
                    </Button>
                  </div>
                )}
                {editDraftOrder === "Random" && (
                  <div>
                    <label className="text-gray-400 text-xs block mb-2">Current Draft Order</label>
                    <div className="space-y-1">
                      {(() => {
                        const maxSlots = league.maxTeams || league.numberOfTeams || 12;
                        const posMap = new Map<number, Team>();
                        (teams || []).forEach(t => { if (t.draftPosition) posMap.set(t.draftPosition, t); });
                        const slots = [];
                        for (let i = 0; i < maxSlots; i++) {
                          const team = posMap.get(i + 1);
                          slots.push(
                            <div key={team?.id || `open-${i}`} className="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-2">
                              <span className="text-primary font-bold text-xs w-5">{i + 1}</span>
                              {team ? (
                                <span className="text-white text-sm flex-1">{team.name}{team.isCpu ? " (CPU)" : ""}</span>
                              ) : (
                                <span className="text-gray-500 text-sm flex-1 italic">Open Slot</span>
                              )}
                            </div>
                          );
                        }
                        return slots;
                      })()}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-2 border-gray-700 text-gray-300 w-full"
                      onClick={handleRandomizeDraftOrder}
                      disabled={isRandomizing}
                    >
                      <Shuffle className="w-3.5 h-3.5 mr-1.5" />
                      {isRandomizing ? "Shuffling..." : "Re-Randomize"}
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
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
                {teams && teams.some(t => t.draftPosition) && (
                  <div>
                    <p className="text-gray-400 text-xs mb-2">Current Order</p>
                    <div className="space-y-1">
                      {(() => {
                        const maxSlots = league.maxTeams || league.numberOfTeams || 12;
                        const posMap = new Map<number, Team>();
                        (teams || []).forEach(t => { if (t.draftPosition) posMap.set(t.draftPosition, t); });
                        return Array.from({ length: maxSlots }, (_, i) => {
                          const team = posMap.get(i + 1);
                          return (
                            <div key={team?.id || `open-${i}`} className="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-1.5">
                              <span className="text-primary font-bold text-xs w-5">{i + 1}</span>
                              {team ? (
                                <span className="text-white text-sm">{team.name}{team.isCpu ? " (CPU)" : ""}</span>
                              ) : (
                                <span className="text-gray-500 text-sm italic">Open Slot</span>
                              )}
                            </div>
                          );
                        });
                      })()}
                    </div>
                  </div>
                )}
              </div>
            )
          ) : (
            <div className="space-y-4">
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
              {teams && teams.some(t => t.draftPosition) && (
                <div>
                  <p className="text-gray-400 text-xs mb-2">Current Order</p>
                  <div className="space-y-1">
                    {(() => {
                      const maxSlots = league.maxTeams || league.numberOfTeams || 12;
                      const posMap = new Map<number, Team>();
                      (teams || []).forEach(t => { if (t.draftPosition) posMap.set(t.draftPosition, t); });
                      return Array.from({ length: maxSlots }, (_, i) => {
                        const team = posMap.get(i + 1);
                        return (
                          <div key={team?.id || `open-${i}`} className="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-1.5">
                            <span className="text-primary font-bold text-xs w-5">{i + 1}</span>
                            {team ? (
                              <span className="text-white text-sm">{team.name}{team.isCpu ? " (CPU)" : ""}</span>
                            ) : (
                              <span className="text-gray-500 text-sm italic">Open Slot</span>
                            )}
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>
              )}
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
