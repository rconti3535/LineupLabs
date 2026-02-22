import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  const leagues = (allPublicLeagues || []).filter(
    league => !userLeagueIds.has(league.id) && (league.currentTeams || 0) < (league.maxTeams || 0) && (!league.draftStatus || league.draftStatus === "pending")
  );

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
      
      <div className="space-y-3">
        {isLoading ? (
          Array.from({ length: 2 }).map((_, i) => (
            <Card key={i} className="league-card rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <Skeleton className="h-6 w-32" />
                <Skeleton className="h-6 w-12 rounded-full" />
              </div>
              <div className="grid grid-cols-3 gap-4 text-sm">
                {Array.from({ length: 3 }).map((_, j) => (
                  <div key={j}>
                    <Skeleton className="h-4 w-12 mb-1" />
                    <Skeleton className="h-5 w-16" />
                  </div>
                ))}
              </div>
            </Card>
          ))
        ) : leagues && leagues.length > 0 ? (
          leagues.map((league) => (
            <Card 
              key={league.id} 
              className="league-card rounded-lg p-4 border-0"
            >
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-white font-medium">{league.name}</h4>
                <Badge 
                  className={`text-xs px-2 py-1 ${
                    league.buyin === "Free" 
                      ? "bg-blue-600 text-white" 
                      : "bg-green-600 text-white"
                  }`}
                >
                  Public
                </Badge>
              </div>
              <div className="grid grid-cols-3 gap-4 text-sm mb-3">
                <div>
                  <p className="text-gray-400">Teams</p>
                  <p className="text-white font-medium">{league.currentTeams}/{league.maxTeams}</p>
                </div>
                <div>
                  <p className="text-gray-400">Type</p>
                  <p className="text-white font-medium">{league.type}</p>
                </div>
                <div>
                  <p className="text-gray-400">Scoring</p>
                  <p className="text-white font-medium">{league.scoringFormat}</p>
                </div>
              </div>
              <Button
                onClick={() => joinMutation.mutate(league.id)}
                disabled={joinMutation.isPending}
                className="w-full bg-green-600 hover:bg-green-700 rounded-lg text-white text-sm font-medium"
              >
                {joinMutation.isPending ? "Joining..." : "Join League"}
              </Button>
            </Card>
          ))
        ) : (
          <Card className="league-card rounded-lg p-6 text-center border-0">
            <p className="text-gray-400">No public leagues available yet</p>
            <p className="text-sm text-gray-500 mt-1">Create a public league to get started!</p>
          </Card>
        )}
      </div>
    </div>
  );
}
