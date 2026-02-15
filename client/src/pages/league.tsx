import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Users, Trophy, Calendar, TrendingUp, Pencil, Trash2, AlertTriangle, ArrowUpDown } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { League, Team, DraftPick, Player } from "@shared/schema";
import { assignPlayersToRosterWithPicks, getSwapTargets, type RosterEntry } from "@/lib/roster-utils";

type Tab = "roster" | "standings" | "settings";

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
                        <table className="w-full" style={{ minWidth: "460px" }}>
                          <thead>
                            <tr className="border-b border-gray-700">
                              {isDraftCompleted && <th className="w-6 pb-1.5"></th>}
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
                            {posEntries.map(entry => {
                              const p = entry.player;
                              return (
                                <tr key={entry.slotIndex} className={getRowClass(entry.slotIndex)} onClick={() => swapTargets.includes(entry.slotIndex) ? handleSwapSelect(entry.slotIndex) : undefined}>
                                  {isDraftCompleted && <td className="py-1.5 pl-1">{renderSwapButton(entry)}</td>}
                                  <td className="py-1.5 pl-1">
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-700 text-gray-300">{entry.slotPos}</span>
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

                  {pitchEntries.length > 0 && (
                    <div>
                      <p className="text-gray-400 text-[11px] uppercase font-bold tracking-wider mb-2">Pitchers</p>
                      <div className="overflow-x-auto hide-scrollbar -mx-1 px-1" style={{ WebkitOverflowScrolling: "touch" }}>
                        <table className="w-full" style={{ minWidth: "460px" }}>
                          <thead>
                            <tr className="border-b border-gray-700">
                              {isDraftCompleted && <th className="w-6 pb-1.5"></th>}
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
                            {pitchEntries.map(entry => {
                              const p = entry.player;
                              return (
                                <tr key={entry.slotIndex} className={getRowClass(entry.slotIndex)} onClick={() => swapTargets.includes(entry.slotIndex) ? handleSwapSelect(entry.slotIndex) : undefined}>
                                  {isDraftCompleted && <td className="py-1.5 pl-1">{renderSwapButton(entry)}</td>}
                                  <td className="py-1.5 pl-1">
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-700 text-gray-300">{entry.slotPos}</span>
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

      {activeTab === "standings" && (
        <Card className="gradient-card rounded-xl p-5 border-0">
          <h3 className="text-white font-semibold mb-4">League Standings</h3>
          {teamsLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-lg" />
              ))}
            </div>
          ) : teams && teams.length > 0 ? (
            <div className="space-y-3">
              {teams.map((team, index) => (
                <div
                  key={team.id}
                  className="flex items-center justify-between p-3 rounded-lg sleeper-card-bg"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-gray-400 text-sm font-medium w-6">{index + 1}</span>
                    <div>
                      <p className="text-white font-medium text-sm">{team.name}</p>
                      <p className="text-gray-400 text-xs">{team.wins}-{team.losses}</p>
                    </div>
                  </div>
                  <p className="text-white font-medium text-sm">{team.points} pts</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-400 text-sm text-center py-4">No teams in this league yet</p>
          )}
        </Card>
      )}

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
