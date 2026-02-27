import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { TeamCard } from "@/components/teams/team-card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import type { Team, League, DraftPick } from "@shared/schema";
import { queryClient } from "@/lib/queryClient";

export default function Teams() {
  const { user } = useAuth();
  const { data: teams, isLoading } = useQuery<Team[]>({
    queryKey: ["/api/teams/user", user?.id],
    queryFn: async () => {
      const res = await fetch(`/api/teams/user/${user?.id}`);
      if (!res.ok) throw new Error("Failed to fetch teams");
      return res.json();
    },
    enabled: !!user?.id,
  });

  const leagueIds = teams?.map((t) => t.leagueId).filter(Boolean) || [];

  const { data: leagues, isLoading: leaguesLoading } = useQuery<League[]>({
    queryKey: ["/api/leagues/batch", ...leagueIds],
    queryFn: async () => {
      const results = await Promise.all(
        leagueIds.map((id) =>
          fetch(`/api/leagues/${id}`).then((r) => (r.ok ? r.json() : null))
        )
      );
      return results.filter(Boolean);
    },
    enabled: leagueIds.length > 0,
    staleTime: 0,
    refetchInterval: 10000,
    refetchOnWindowFocus: true,
  });

  const leagueMap = new Map<number, { name: string; isPublic: boolean; createdBy: number | null; leagueImage: string | null; draftStatus: string | null }>();
  leagues?.forEach((l) => leagueMap.set(l.id, { name: l.name, isPublic: l.isPublic ?? false, createdBy: l.createdBy, leagueImage: l.leagueImage, draftStatus: l.draftStatus }));

  const liveLeagueIds = (leagues || [])
    .filter(l => l.draftStatus === "active")
    .map(l => l.id);

  const { data: liveTurnMap } = useQuery<Record<number, number | null>>({
    queryKey: ["/api/teams/live-turn-map", ...liveLeagueIds],
    queryFn: async () => {
      const entries = await Promise.all(
        liveLeagueIds.map(async (leagueId) => {
          const [teamsRes, picksRes] = await Promise.all([
            fetch(`/api/teams/league/${leagueId}`),
            fetch(`/api/leagues/${leagueId}/draft-picks`),
          ]);
          if (!teamsRes.ok || !picksRes.ok) return [leagueId, null] as const;

          const leagueTeams: Team[] = await teamsRes.json();
          const picks: DraftPick[] = await picksRes.json();
          const league = leagues?.find(l => l.id === leagueId);
          if (!league || leagueTeams.length === 0) return [leagueId, null] as const;

          const sortedTeams = [...leagueTeams].sort((a, b) => (a.draftPosition || 999) - (b.draftPosition || 999));
          const numTeams = sortedTeams.length;
          const totalRounds = league.maxRosterSize || (league.rosterPositions || []).length;
          const nextOverall = picks.length + 1;
          if (nextOverall > totalRounds * numTeams) return [leagueId, null] as const;

          const round = Math.ceil(nextOverall / numTeams);
          const pickInRound = ((nextOverall - 1) % numTeams) + 1;
          const isOddRound = round % 2 === 1;
          const teamIndex = isOddRound ? pickInRound - 1 : numTeams - pickInRound;
          const pickingTeam = sortedTeams[teamIndex];

          return [leagueId, pickingTeam?.id ?? null] as const;
        })
      );

      return Object.fromEntries(entries);
    },
    enabled: liveLeagueIds.length > 0,
    refetchInterval: 2000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  useEffect(() => {
    if (liveLeagueIds.length === 0) return;

    const sources: EventSource[] = [];
    const reconnectTimers: ReturnType<typeof setTimeout>[] = [];
    let closed = false;

    const connectLeague = (leagueId: number) => {
      const es = new EventSource(`/api/leagues/${leagueId}/draft-events`);
      sources.push(es);

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "pick" || data.type === "draft-status" || data.type === "teams-update" || data.type === "league-settings") {
            queryClient.refetchQueries({ queryKey: ["/api/teams/live-turn-map"] });
            queryClient.refetchQueries({ queryKey: ["/api/leagues", leagueId, "draft-picks"] });
            queryClient.refetchQueries({ queryKey: ["/api/leagues/batch"] });
          }
        } catch {
          // Ignore malformed SSE payloads.
        }
      };

      es.onerror = () => {
        es.close();
        if (!closed) {
          const timer = setTimeout(() => connectLeague(leagueId), 3000);
          reconnectTimers.push(timer);
        }
      };
    };

    liveLeagueIds.forEach(connectLeague);

    return () => {
      closed = true;
      sources.forEach((es) => es.close());
      reconnectTimers.forEach((t) => clearTimeout(t));
    };
  }, [liveLeagueIds.join(",")]);

  const showSkeleton = isLoading || (teams && teams.length > 0 && leagueIds.length > 0 && leaguesLoading);

  return (
    <div className="px-4 py-6">
      <div className="space-y-3">
        {showSkeleton ? (
          Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="gradient-card rounded-xl p-4">
              <div className="flex items-center space-x-3">
                <Skeleton className="w-10 h-10 rounded-lg" />
                <div className="flex-1">
                  <Skeleton className="h-4 w-32 mb-1" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
            </div>
          ))
        ) : teams && teams.length > 0 ? (
          teams.map((team) => (
            <TeamCard
              key={team.id}
              team={team}
              leagueName={leagueMap.get(team.leagueId!)?.name}
              isPublic={leagueMap.get(team.leagueId!)?.isPublic}
              isCommissioner={leagueMap.get(team.leagueId!)?.createdBy === user?.id}
              leagueImage={leagueMap.get(team.leagueId!)?.leagueImage}
              draftLive={leagueMap.get(team.leagueId!)?.draftStatus === "active"}
              userTurn={!!team.leagueId && !!liveTurnMap && liveTurnMap[team.leagueId] === team.id}
            />
          ))
        ) : (
          <div className="gradient-card rounded-xl p-8 text-center">
            <p className="text-gray-400 mb-4">You don't have any teams yet</p>
            <p className="text-sm text-gray-500">Join a league to create your first team</p>
          </div>
        )}
      </div>
    </div>
  );
}
