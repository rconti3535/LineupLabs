import { useQuery } from "@tanstack/react-query";
import { TeamCard } from "@/components/teams/team-card";
import { QuickTeamActions } from "@/components/teams/quick-team-actions";
import { Skeleton } from "@/components/ui/skeleton";
import type { Team } from "@shared/schema";

export default function Teams() {
  const { data: teams, isLoading } = useQuery<Team[]>({
    queryKey: ["/api/teams/user/1"], // Using user ID 1 for demo
  });

  return (
    <div className="px-4 py-6">
      {/* Teams List */}
      <div className="space-y-4">
        {isLoading ? (
          Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="gradient-card rounded-xl p-6">
              <div className="flex items-center space-x-3 mb-4">
                <Skeleton className="w-12 h-12 rounded-lg" />
                <div className="flex-1">
                  <Skeleton className="h-6 w-32 mb-2" />
                  <Skeleton className="h-4 w-24" />
                </div>
                <div className="text-right">
                  <Skeleton className="h-6 w-8 mb-1" />
                  <Skeleton className="h-4 w-12" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                {Array.from({ length: 3 }).map((_, j) => (
                  <div key={j}>
                    <Skeleton className="h-4 w-12 mb-1" />
                    <Skeleton className="h-5 w-16" />
                  </div>
                ))}
              </div>
            </div>
          ))
        ) : teams && teams.length > 0 ? (
          teams.map((team) => <TeamCard key={team.id} team={team} />)
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
