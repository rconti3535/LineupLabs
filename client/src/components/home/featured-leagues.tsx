import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { League } from "@shared/schema";

export function FeaturedLeagues() {
  const { data: leagues, isLoading } = useQuery<League[]>({
    queryKey: ["/api/leagues/public"],
  });

  const handleJoinLeague = (leagueId: number) => {
    // TODO: Implement join league functionality
    console.log("Join league:", leagueId);
  };

  return (
    <div>
      <h3 className="text-lg font-semibold text-white mb-4">Featured Public Leagues</h3>
      
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
              className="league-card rounded-lg p-4 hover-lift cursor-pointer border-0"
              onClick={() => handleJoinLeague(league.id)}
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
                  {league.status}
                </Badge>
              </div>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-gray-400">Teams</p>
                  <p className="text-white font-medium">{league.currentTeams}/{league.maxTeams}</p>
                </div>
                <div>
                  <p className="text-gray-400">Buy-in</p>
                  <p className="text-white font-medium">{league.buyin}</p>
                </div>
                <div>
                  <p className="text-gray-400">Prize</p>
                  <p className="text-white font-medium">{league.prize}</p>
                </div>
              </div>
            </Card>
          ))
        ) : (
          <Card className="league-card rounded-lg p-6 text-center border-0">
            <p className="text-gray-400">No public leagues available</p>
          </Card>
        )}
      </div>
    </div>
  );
}
