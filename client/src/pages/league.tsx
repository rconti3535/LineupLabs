import { useQuery } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Users, Trophy, Calendar, TrendingUp } from "lucide-react";
import type { League, Team } from "@shared/schema";

export default function LeaguePage() {
  const [, params] = useRoute("/league/:id");
  const [, setLocation] = useLocation();
  const leagueId = params?.id ? parseInt(params.id) : null;

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

  if (leagueLoading) {
    return (
      <div className="px-4 py-6">
        <Skeleton className="h-8 w-48 mb-4" />
        <Skeleton className="h-40 w-full rounded-xl mb-4" />
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

  return (
    <div className="px-4 py-6">
      <Button
        onClick={() => setLocation("/teams")}
        variant="ghost"
        className="text-gray-400 hover:text-white mb-4"
      >
        <ArrowLeft className="w-4 h-4 mr-2" />
        Back to Teams
      </Button>

      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-2xl font-bold text-white">{league.name}</h1>
          <Badge className={league.isPublic ? "bg-green-600 text-white" : "bg-gray-600 text-white"}>
            {league.isPublic ? "Public" : "Private"}
          </Badge>
        </div>
        {league.description && (
          <p className="text-gray-400">{league.description}</p>
        )}
      </div>

      <Card className="gradient-card rounded-xl p-5 border-0 mb-4">
        <h3 className="text-white font-semibold mb-4">League Info</h3>
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
      </Card>

      <Card className="gradient-card rounded-xl p-5 border-0">
        <h3 className="text-white font-semibold mb-4">Teams</h3>
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
    </div>
  );
}
