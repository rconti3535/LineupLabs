import { useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Team } from "@shared/schema";

interface TeamCardProps {
  team: Team;
  leagueName?: string;
  isPublic?: boolean;
  isCommissioner?: boolean;
}

export function TeamCard({ team, leagueName, isPublic, isCommissioner }: TeamCardProps) {
  const [, setLocation] = useLocation();

  return (
    <Card 
      className="gradient-card rounded-xl p-4 hover-lift cursor-pointer border-0"
      onClick={() => setLocation(`/league/${team.leagueId}`)}
    >
      <div className="flex items-center space-x-3">
        <img
          src={team.logo || "https://images.unsplash.com/photo-1518611012118-696072aa579a?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=60&h=60"}
          alt="Team logo"
          className="w-10 h-10 rounded-lg object-cover"
        />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-white truncate">{leagueName || `League #${team.leagueId}`}</h3>
          <div className="flex items-center gap-1.5">
            <p className="text-gray-400 text-xs truncate">{team.name}</p>
            {isCommissioner ? (
              <Badge className="text-[10px] px-1.5 py-0 shrink-0 bg-yellow-600 text-white">
                Commish
              </Badge>
            ) : (
              <Badge className={`text-[10px] px-1.5 py-0 shrink-0 ${isPublic ? "bg-green-600 text-white" : "bg-gray-600 text-white"}`}>
                {isPublic ? "Public" : "Private"}
              </Badge>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
