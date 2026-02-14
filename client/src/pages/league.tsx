import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Users, Trophy, Calendar, TrendingUp, Pencil } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { League, Team } from "@shared/schema";

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
  const [isEditingDraft, setIsEditingDraft] = useState(false);
  const [editDraftType, setEditDraftType] = useState("");
  const [editDraftDate, setEditDraftDate] = useState("");
  const [editSecondsPerPick, setEditSecondsPerPick] = useState("");
  const [editDraftOrder, setEditDraftOrder] = useState("");
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
    setEditScoringFormat(league.scoringFormat || "5x5 Roto");
    setEditType(league.type || "Redraft");
    setEditStatus(league.status || "Open");
    setIsEditing(true);
  };

  const saveSettings = () => {
    updateMutation.mutate({
      maxTeams: parseInt(editMaxTeams),
      scoringFormat: editScoringFormat,
      type: editType,
      status: editStatus,
    });
  };

  const startEditingRoster = () => {
    if (!league) return;
    setEditRosterPositions(league.rosterPositions || ["C", "1B", "2B", "3B", "SS", "OF", "OF", "OF", "UTIL", "SP", "SP", "RP", "RP", "BN", "BN", "IL"]);
    setIsEditingRoster(true);
  };

  const saveRosterSettings = () => {
    updateMutation.mutate({ rosterPositions: editRosterPositions });
    setIsEditingRoster(false);
  };

  const addPosition = (pos: string) => {
    setEditRosterPositions([...editRosterPositions, pos]);
  };

  const removePosition = (index: number) => {
    setEditRosterPositions(editRosterPositions.filter((_, i) => i !== index));
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
          {league.status === "Open" || league.status === "Full" ? (
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

          {myTeam ? (
            <Card className="gradient-card rounded-xl p-5 border-0">
              <h3 className="text-white font-semibold mb-3">{myTeam.name}</h3>
              <div className="space-y-1.5">
                {(league.rosterPositions || []).map((pos, index) => (
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
                  <label className="text-gray-400 text-xs block mb-1">Scoring Format</label>
                  <Select value={editScoringFormat} onValueChange={setEditScoringFormat}>
                    <SelectTrigger className="bg-gray-800 border-gray-700 text-white text-sm h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="5x5 Roto">5x5 Roto</SelectItem>
                    </SelectContent>
                  </Select>
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
                  <TrendingUp className="w-4 h-4 text-blue-400" />
                  <div>
                    <p className="text-gray-400 text-xs">Scoring</p>
                    <p className="text-white font-medium text-sm">{league.scoringFormat}</p>
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
                    <p className="text-white font-medium text-sm">{league.status}</p>
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
              <div>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {editRosterPositions.map((pos, index) => (
                    <Badge
                      key={index}
                      className="bg-blue-600 text-white text-xs px-2 py-0.5 cursor-pointer hover:bg-red-600"
                      onClick={() => removePosition(index)}
                    >
                      {pos} ×
                    </Badge>
                  ))}
                </div>
                <p className="text-gray-500 text-[10px] mb-2">Tap a position above to remove it. Tap below to add.</p>
                <div className="flex flex-wrap gap-1.5">
                  {ALL_POSITIONS.map((pos) => (
                    <Badge
                      key={pos}
                      className="bg-gray-700 text-gray-300 text-xs px-2 py-0.5 cursor-pointer hover:bg-gray-600"
                      onClick={() => addPosition(pos)}
                    >
                      + {pos}
                    </Badge>
                  ))}
                </div>
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

        <Card className="gradient-card rounded-xl p-5 border-0 mt-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white font-semibold">Draft Settings</h3>
            {isCommissioner && !isEditingDraft && (
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
        </>
      )}
    </div>
  );
}
