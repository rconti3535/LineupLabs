import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Search, TrendingUp } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

interface ExposurePlayer {
  playerId: number;
  name: string;
  position: string;
  team: string;
  leagueCount: number;
  totalLeagues: number;
  percentage: number;
}

interface ExposureData {
  totalLeagues: number;
  players: ExposurePlayer[];
}

const POSITION_COLORS: Record<string, string> = {
  C: "text-blue-400",
  "1B": "text-green-400",
  "2B": "text-orange-400",
  "3B": "text-purple-400",
  SS: "text-red-400",
  OF: "text-cyan-400",
  LF: "text-cyan-400",
  CF: "text-cyan-400",
  RF: "text-cyan-400",
  DH: "text-gray-300",
  SP: "text-yellow-400",
  RP: "text-pink-400",
  UT: "text-gray-300",
};

function getBarColor(pct: number): string {
  if (pct >= 75) return "bg-green-500";
  if (pct >= 50) return "bg-blue-500";
  if (pct >= 25) return "bg-yellow-500";
  return "bg-gray-500";
}

export default function Exposure() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery<ExposureData>({
    queryKey: ["/api/users", user?.id, "exposure"],
    queryFn: async () => {
      const res = await fetch(`/api/users/${user?.id}/exposure`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!user?.id,
  });

  const filtered = (data?.players || []).filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="px-4 py-6">
      <div className="mb-5">
        <h2 className="text-2xl font-bold text-white mb-1">Exposure</h2>
        <p className="text-gray-400 text-sm">
          Players you've drafted across {data?.totalLeagues ?? 0} league{data?.totalLeagues !== 1 ? "s" : ""}
        </p>
      </div>

      <div className="relative mb-5">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
        <Input
          placeholder="Search players..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10 sleeper-card-bg sleeper-border border text-white placeholder-gray-400"
        />
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 sleeper-card-bg rounded-xl px-4 py-3">
              <Skeleton className="w-10 h-10 rounded-full" />
              <div className="flex-1">
                <Skeleton className="h-4 w-32 mb-2" />
                <Skeleton className="h-2.5 w-full rounded-full" />
              </div>
              <Skeleton className="h-5 w-12" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="gradient-card rounded-xl p-8 text-center border-0">
          <TrendingUp className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-400 mb-2">
            {search ? "No players match your search" : "No exposure data yet"}
          </p>
          <p className="text-sm text-gray-500">
            {search ? "Try a different name" : "Draft players in leagues to see your exposure"}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((p) => (
            <div
              key={p.playerId}
              className="flex items-center gap-3 sleeper-card-bg rounded-xl px-4 py-3"
            >
              <div className="shrink-0 w-[130px]">
                <p className="text-sm font-semibold text-white truncate">{p.name}</p>
                <p className="text-[11px]">
                  <span className={POSITION_COLORS[p.position] || "text-gray-400"}>{p.position}</span>
                  <span className="text-gray-500 ml-1.5">{p.team}</span>
                </p>
              </div>
              <div className="flex-1 min-w-0">
                <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${getBarColor(p.percentage)}`}
                    style={{ width: `${Math.max(p.percentage, 2)}%` }}
                  />
                </div>
              </div>
              <div className="shrink-0 text-right w-[60px]">
                <p className="text-sm font-bold text-white">{p.percentage.toFixed(0)}%</p>
                <p className="text-[10px] text-gray-500">
                  {p.leagueCount}/{p.totalLeagues}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
