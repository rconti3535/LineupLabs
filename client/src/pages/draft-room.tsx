import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Clock, Users, Zap } from "lucide-react";
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
  const draftDate = league?.draftDate ? new Date(league.draftDate) : null;
  const isCommissioner = user?.id === league?.createdBy;

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

  return (
    <div className="px-4 py-6">
      <Button
        onClick={() => setLocation(`/league/${leagueId}`)}
        variant="ghost"
        className="text-gray-400 hover:text-white mb-3 -ml-2"
      >
        <ArrowLeft className="w-4 h-4 mr-2" />
        Back to League
      </Button>

      <div className="mb-5">
        <h1 className="text-lg font-bold text-white">Draft Room</h1>
        <p className="text-gray-400 text-sm">{league.name}</p>
      </div>

      <Card className="gradient-card rounded-xl p-5 border-0 mb-4">
        <div className="flex items-center gap-2 mb-4">
          <Zap className="w-5 h-5 text-yellow-400" />
          <h3 className="text-white font-semibold">Draft Info</h3>
          <Badge className="bg-yellow-600/20 text-yellow-400 text-[10px] ml-auto">
            {league.draftType || "Snake"}
          </Badge>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="sleeper-card-bg rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="w-3.5 h-3.5 text-gray-400" />
              <p className="text-gray-400 text-xs">Draft Date</p>
            </div>
            <p className="text-white text-sm font-medium">
              {draftDate
                ? draftDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                : "TBD"}
            </p>
            {draftDate && (
              <p className="text-gray-500 text-[11px]">
                {draftDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
              </p>
            )}
          </div>
          <div className="sleeper-card-bg rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <Users className="w-3.5 h-3.5 text-gray-400" />
              <p className="text-gray-400 text-xs">Teams</p>
            </div>
            <p className="text-white text-sm font-medium">{teams?.length || 0} / {league.maxTeams || 12}</p>
          </div>
          <div className="sleeper-card-bg rounded-lg p-3">
            <p className="text-gray-400 text-xs mb-1">Seconds Per Pick</p>
            <p className="text-white text-sm font-medium">{league.secondsPerPick || 60}s</p>
          </div>
          <div className="sleeper-card-bg rounded-lg p-3">
            <p className="text-gray-400 text-xs mb-1">Total Rounds</p>
            <p className="text-white text-sm font-medium">{totalRounds}</p>
          </div>
        </div>
      </Card>

      <Card className="gradient-card rounded-xl p-5 border-0 mb-4">
        <h3 className="text-white font-semibold mb-3">Draft Order</h3>
        {teams && teams.length > 0 ? (
          <div className="space-y-2">
            {teams.map((team, index) => (
              <div
                key={team.id}
                className="flex items-center gap-3 p-2.5 rounded-lg sleeper-card-bg"
              >
                <span className="text-gray-400 text-xs font-bold w-6 text-center">{index + 1}</span>
                <div className="flex-1">
                  <p className="text-white text-sm font-medium">{team.name}</p>
                </div>
                {team.userId === user?.id && (
                  <Badge className="bg-blue-600/20 text-blue-400 text-[10px]">You</Badge>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 text-sm text-center py-4">No teams joined yet</p>
        )}
      </Card>

      <Card className="gradient-card rounded-xl p-5 border-0">
        <h3 className="text-white font-semibold mb-3">Draft Board</h3>
        <p className="text-gray-500 text-sm text-center py-8">
          The draft has not started yet. When the draft begins, picks will appear here in real time.
        </p>
      </Card>
    </div>
  );
}
