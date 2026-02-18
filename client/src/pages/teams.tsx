import { useQuery } from "@tanstack/react-query";
import { TeamCard } from "@/components/teams/team-card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import type { Team, League } from "@shared/schema";

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
  });

  const leagueMap = new Map<number, { name: string; isPublic: boolean; createdBy: number | null; leagueImage: string | null }>();
  leagues?.forEach((l) => leagueMap.set(l.id, { name: l.name, isPublic: l.isPublic ?? false, createdBy: l.createdBy, leagueImage: l.leagueImage }));

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
