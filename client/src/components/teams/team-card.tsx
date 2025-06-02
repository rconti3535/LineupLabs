import { Card } from "@/components/ui/card";
import type { Team } from "@shared/schema";

interface TeamCardProps {
  team: Team;
}

export function TeamCard({ team }: TeamCardProps) {
  const handleTeamClick = () => {
    // TODO: Navigate to team details
    console.log("Team clicked:", team.id);
  };

  return (
    <Card 
      className="gradient-card rounded-xl p-6 hover-lift cursor-pointer border-0"
      onClick={handleTeamClick}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <img
            src={team.logo || "https://images.unsplash.com/photo-1518611012118-696072aa579a?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=60&h=60"}
            alt="Team logo"
            className="w-12 h-12 rounded-lg object-cover"
          />
          <div>
            <h3 className="text-lg font-semibold text-white">{team.name}</h3>
            <p className="text-gray-400 text-sm">League #{team.leagueId}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-white font-semibold">#{team.rank}</p>
          <p className="text-gray-400 text-sm">Rank</p>
        </div>
      </div>
      
      <div className="grid grid-cols-3 gap-4 text-sm">
        <div>
          <p className="text-gray-400">Record</p>
          <p className="text-white font-medium">{team.wins}-{team.losses}</p>
        </div>
        <div>
          <p className="text-gray-400">Points</p>
          <p className="text-white font-medium">{team.points?.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-gray-400">Next Game</p>
          <p className="text-white font-medium">vs {team.nextOpponent}</p>
        </div>
      </div>
    </Card>
  );
}
