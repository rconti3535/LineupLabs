import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Trophy, Award, Medal } from "lucide-react";

interface ProfileStats {
  allTimeLeagues: number;
  completedLeagues: number;
  gold: number;
  silver: number;
  bronze: number;
  winRate: number;
  trophyRate: number;
  gmTier: string;
}

const GM_TIER_COLORS: Record<string, string> = {
  "Intern": "text-gray-400",
  "Rookie": "text-green-400",
  "Scout": "text-blue-400",
  "Manager": "text-purple-400",
  "Director": "text-orange-400",
  "Executive": "text-red-400",
  "Hall of Fame": "text-yellow-400",
};

export default function Home() {
  const { user } = useAuth();
  const { data: stats } = useQuery<ProfileStats>({
    queryKey: ["/api/users", user?.id, "profile-stats"],
    queryFn: async () => {
      const res = await fetch(`/api/users/${user?.id}/profile-stats`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!user?.id,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const tierColor = GM_TIER_COLORS[stats?.gmTier || "Intern"] || "text-gray-400";

  return (
    <div className="px-4 py-6 space-y-4">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-white">Rank</h2>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-center gap-2 mb-4">
          <Trophy className="w-5 h-5 text-blue-400" />
          <span className="text-sm text-gray-400">GM Tier</span>
          <span className={`text-lg font-bold ${tierColor}`}>{stats?.gmTier || "Intern"}</span>
        </div>

        <div className="bg-gray-800/60 rounded-xl py-3 text-center mb-4">
          <div className="text-2xl font-bold text-white">{stats?.allTimeLeagues ?? 0}</div>
          <div className="text-[10px] text-gray-400 font-medium">ALL-TIME LEAGUES</div>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl py-3 text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Award className="w-4 h-4 text-yellow-400" />
            </div>
            <div className="text-2xl font-bold text-yellow-400">{stats?.gold ?? 0}</div>
            <div className="text-[10px] text-yellow-400/70 font-medium">GOLD</div>
          </div>
          <div className="bg-gray-400/10 border border-gray-400/20 rounded-xl py-3 text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Medal className="w-4 h-4 text-gray-300" />
            </div>
            <div className="text-2xl font-bold text-gray-300">{stats?.silver ?? 0}</div>
            <div className="text-[10px] text-gray-400/70 font-medium">SILVER</div>
          </div>
          <div className="bg-orange-600/10 border border-orange-600/20 rounded-xl py-3 text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Medal className="w-4 h-4 text-orange-400" />
            </div>
            <div className="text-2xl font-bold text-orange-400">{stats?.bronze ?? 0}</div>
            <div className="text-[10px] text-orange-500/70 font-medium">BRONZE</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gray-800/60 rounded-xl py-3 text-center">
            <div className="text-xl font-bold text-white">{(stats?.winRate ?? 0).toFixed(1)}%</div>
            <div className="text-[10px] text-gray-400 font-medium">WIN RATE</div>
          </div>
          <div className="bg-gray-800/60 rounded-xl py-3 text-center">
            <div className="text-xl font-bold text-white">{(stats?.trophyRate ?? 0).toFixed(1)}%</div>
            <div className="text-[10px] text-gray-400 font-medium">TROPHY RATE</div>
          </div>
        </div>
      </div>
    </div>
  );
}
