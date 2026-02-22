import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Search, TrendingUp } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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

const INF_POSITIONS = ["1B", "2B", "3B", "SS"];
const OF_POSITIONS = ["OF", "LF", "CF", "RF", "DH", "UT"];

export default function Exposure() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [posFilter, setPosFilter] = useState("ALL");

  const { data, isLoading } = useQuery<ExposureData>({
    queryKey: ["/api/users", user?.id, "exposure"],
    queryFn: async () => {
      const res = await fetch(`/api/users/${user?.id}/exposure`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!user?.id,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const filtered = useMemo(() => {
    if (!data?.players) return [];
    return data.players.filter(p => {
      if (posFilter !== "ALL") {
        if (posFilter === "INF" && !INF_POSITIONS.includes(p.position)) return false;
        if (posFilter === "OF" && !OF_POSITIONS.includes(p.position)) return false;
        if (posFilter !== "INF" && posFilter !== "OF" && p.position !== posFilter) return false;
      }
      if (search.trim()) {
        const q = search.toLowerCase();
        if (!p.name.toLowerCase().includes(q) && !p.position.toLowerCase().includes(q) && !p.team?.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [data?.players, search, posFilter]);

  return (
    <div className="px-4 py-6">
      <div className="flex items-center gap-2 mb-5">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
          <Input
            placeholder="Search players..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 h-9 sleeper-card-bg sleeper-border border text-white placeholder-gray-400 text-sm"
          />
        </div>
        <Select value={posFilter} onValueChange={setPosFilter}>
          <SelectTrigger className="h-9 w-[80px] bg-gray-800 border-gray-700 text-gray-200 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-gray-900 border-gray-700">
            {["ALL", "C", "INF", "OF", "SP", "RP"].map((pos) => (
              <SelectItem key={pos} value={pos} className="text-gray-200 focus:bg-gray-800 focus:text-white">
                {pos}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2 px-2 py-1.5 border-b border-gray-800/60">
              <div className="flex-1">
                <Skeleton className="h-4 w-32 mb-1" />
                <Skeleton className="h-3 w-20" />
              </div>
              <Skeleton className="h-5 w-10" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="gradient-card rounded-xl p-8 text-center border-0">
          <TrendingUp className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-400 mb-2">
            {search || posFilter !== "ALL" ? "No players match your filters" : "No exposure data yet"}
          </p>
          <p className="text-sm text-gray-500">
            {search || posFilter !== "ALL" ? "Try adjusting your search or filter" : "Draft players in leagues to see your exposure"}
          </p>
        </div>
      ) : (
        <div>
          {filtered.map((p) => (
            <div
              key={p.playerId}
              className="flex items-center gap-2 px-2 py-1.5 border-b border-gray-800/60"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{p.name}</p>
                <p className="text-[10px]">
                  <span className={POSITION_COLORS[p.position] || "text-gray-400"}>{p.position}</span>
                  <span className="text-gray-500 ml-1.5">{p.team}</span>
                </p>
              </div>
              <span className="shrink-0 text-sm font-bold text-blue-400">{p.percentage.toFixed(0)}%</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
