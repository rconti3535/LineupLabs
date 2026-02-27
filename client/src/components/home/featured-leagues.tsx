import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import type { League, Team } from "@shared/schema";

export function FeaturedLeagues() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const { data: allPublicLeagues, isLoading } = useQuery<League[]>({
    queryKey: ["/api/leagues/public"],
    staleTime: 0,
    refetchInterval: 120000,
    refetchOnMount: "always",
  });

  const { data: userTeams } = useQuery<Team[]>({
    queryKey: ["/api/teams/user", user?.id],
    queryFn: async () => {
      const res = await fetch(`/api/teams/user/${user?.id}`);
      if (!res.ok) throw new Error("Failed to fetch user teams");
      return res.json();
    },
    enabled: !!user?.id,
  });

  const userLeagueIds = new Set((userTeams || []).map(t => t.leagueId));
  const leagues = (allPublicLeagues || [])
    .filter(
      league => !userLeagueIds.has(league.id) && (league.currentTeams || 0) < (league.maxTeams || 0) && (!league.draftStatus || league.draftStatus === "pending")
    )
    .sort((a, b) => {
      const aJoined = a.currentTeams || 0;
      const bJoined = b.currentTeams || 0;
      if (bJoined !== aJoined) return bJoined - aJoined;

      const aDraft = a.draftDate ? new Date(a.draftDate).getTime() : Number.MAX_SAFE_INTEGER;
      const bDraft = b.draftDate ? new Date(b.draftDate).getTime() : Number.MAX_SAFE_INTEGER;
      return aDraft - bDraft;
    })
    .slice(0, 20);

  const joinMutation = useMutation({
    mutationFn: async (leagueId: number) => {
      const response = await apiRequest("POST", `/api/leagues/${leagueId}/join`, {
        userId: user?.id,
      });
      return { leagueId, ...(await response.json()) };
    },
    onSuccess: (data) => {
      toast({
        title: "Joined League!",
        description: "Your team has been created.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues/public"] });
      queryClient.invalidateQueries({ queryKey: ["/api/teams/user"] });
      navigate(`/league/${data.leagueId}`);
    },
    onError: (error) => {
      toast({
        title: "Could not join league",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return (
    <div id="public-leagues">
      <h3 className="text-lg font-semibold text-white mb-4">Quick Join</h3>
      
      <div className="space-y-2">
        {isLoading ? (
          Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="league-card rounded-md p-2.5 border border-white/15 bg-white/[0.03] backdrop-blur-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-10" />
                  <Skeleton className="h-4 w-14" />
                  <Skeleton className="h-4 w-16" />
                </div>
                <Skeleton className="h-7 w-20 rounded-md shrink-0" />
              </div>
            </div>
          ))
        ) : leagues && leagues.length > 0 ? (
          leagues.map((league) => (
            <div key={league.id} className="league-card rounded-md p-2.5 border border-white/15 bg-white/[0.03] backdrop-blur-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
              <div className="mb-1">
                <h4 className="text-white text-sm font-medium truncate">{league.name}</h4>
              </div>
              <div className="flex items-center justify-between gap-1.5">
                <div className="flex items-center gap-2 text-[11px] min-w-0 overflow-x-auto hide-scrollbar pr-1">
                  <div className="shrink-0 text-gray-300">
                    <span className="text-gray-500">Teams</span> {league.currentTeams}/{league.maxTeams}
                  </div>
                  <div className="shrink-0 text-gray-300">
                    {league.type}
                  </div>
                  <div className="shrink-0 text-gray-300">
                    {league.scoringFormat}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <div className="text-[11px] text-gray-300 text-right whitespace-nowrap">
                    {league.draftDate
                      ? `${new Date(league.draftDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })} ${new Date(league.draftDate).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`
                      : "TBD"}
                  </div>
                  <Button
                    onClick={() => joinMutation.mutate(league.id)}
                    disabled={joinMutation.isPending}
                    className="bg-green-600 hover:bg-green-700 rounded-md text-white text-xs font-semibold h-7 px-2.5 shrink-0"
                  >
                    {joinMutation.isPending ? "Joining..." : "Join"}
                  </Button>
                </div>
              </div>
            </div>
          ))
        ) : (
          <Card className="league-card rounded-lg p-6 text-center border border-white/10 bg-white/[0.02] backdrop-blur-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
            <p className="text-gray-400">No public leagues available yet</p>
            <p className="text-sm text-gray-500 mt-1">Create a public league to get started!</p>
          </Card>
        )}
      </div>
    </div>
  );
}
