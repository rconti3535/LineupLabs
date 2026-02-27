import { useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trophy } from "lucide-react";
import type { Team } from "@shared/schema";

interface TeamCardProps {
  team: Team;
  leagueName?: string;
  isPublic?: boolean;
  isCommissioner?: boolean;
  leagueImage?: string | null;
  draftLive?: boolean;
  userTurn?: boolean;
}

export function TeamCard({ team, leagueName, isCommissioner, leagueImage, draftLive, userTurn }: TeamCardProps) {
  const [, setLocation] = useLocation();

  return (
    <Card 
      className="gradient-card rounded-xl p-4 hover-lift cursor-pointer border-0"
      onClick={() => setLocation(`/league/${team.leagueId}`)}
    >
      <div className="flex items-center space-x-3">
        {leagueImage ? (
          <img
            src={leagueImage}
            alt="League"
            className="w-10 h-10 rounded-lg object-cover"
          />
        ) : (
          <div className="w-10 h-10 rounded-lg bg-gray-700 flex items-center justify-center">
            <Trophy className="w-5 h-5 text-gray-400" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-white truncate">{leagueName || `League #${team.leagueId}`}</h3>
          <div className="flex items-center gap-1.5">
            <p className="text-gray-400 text-xs truncate">{team.name}</p>
            {leagueName && isCommissioner && (
              <Badge className="text-[10px] px-1.5 py-0 shrink-0 bg-yellow-600 text-white">
                Commish
              </Badge>
            )}
          </div>
        </div>
        {draftLive && (
          <div className="flex items-center gap-2 ml-auto shrink-0">
            <span className={`text-[10px] px-1.5 py-0.5 rounded-md border ${userTurn ? "bg-blue-600/20 border-blue-500/40 text-blue-300" : "bg-green-600/20 border-green-500/40 text-green-300"}`}>
              {userTurn ? "Your Turn!" : "Live Draft"}
            </span>
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${userTurn ? "bg-blue-400" : "bg-green-400"} opacity-75`}></span>
              <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${userTurn ? "bg-blue-500" : "bg-green-500"}`}></span>
            </span>
          </div>
        )}
      </div>
    </Card>
  );
}
