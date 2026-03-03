import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Trophy, Award, Medal, Users } from "lucide-react";

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

type RankTier = {
  name: string;
  leagues: number;
  medals: number;
  winRate: number;
  trophyRate: number;
};

const RANK_TIERS_ASC: RankTier[] = [
  { name: "Intern", leagues: 0, medals: 0, winRate: 0, trophyRate: 0 },
  { name: "Analyst", leagues: 5, medals: 0, winRate: 0, trophyRate: 0 },
  { name: "Assistant Coordinator", leagues: 10, medals: 3, winRate: 2, trophyRate: 10 },
  { name: "Coordinator", leagues: 25, medals: 8, winRate: 3, trophyRate: 12 },
  { name: "Assistant Director", leagues: 50, medals: 15, winRate: 4, trophyRate: 14 },
  { name: "Director", leagues: 100, medals: 30, winRate: 6, trophyRate: 18 },
  { name: "Assistant GM", leagues: 150, medals: 45, winRate: 8, trophyRate: 24 },
  { name: "GM", leagues: 250, medals: 75, winRate: 12, trophyRate: 30 },
];

export default function Home() {
  const { user } = useAuth();
  const [animatedStats, setAnimatedStats] = useState({
    leagues: 0,
    gold: 0,
    silver: 0,
    bronze: 0,
    winRate: 0,
    trophyRate: 0,
  });

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

  const userLeagues = stats?.allTimeLeagues ?? 0;
  const userMedals = (stats?.gold ?? 0) + (stats?.silver ?? 0) + (stats?.bronze ?? 0);
  const userWinRate = stats?.winRate ?? 0;
  const userTrophyRate = stats?.trophyRate ?? 0;

  useEffect(() => {
    if (!stats) return;

    const target = {
      leagues: stats.allTimeLeagues ?? 0,
      gold: stats.gold ?? 0,
      silver: stats.silver ?? 0,
      bronze: stats.bronze ?? 0,
      winRate: stats.winRate ?? 0,
      trophyRate: stats.trophyRate ?? 0,
    };

    const start = {
      leagues: 1000,
      gold: 1000,
      silver: 1000,
      bronze: 1000,
      winRate: 100,
      trophyRate: 100,
    };

    const durationMs = 800;
    let rafId = 0;
    const startTs = performance.now();

    const easeOutQuart = (t: number) => 1 - Math.pow(1 - t, 4);

    const tick = (now: number) => {
      const elapsed = now - startTs;
      const progress = Math.min(1, elapsed / durationMs);
      const eased = easeOutQuart(progress);

      setAnimatedStats({
        leagues: Math.round(start.leagues + (target.leagues - start.leagues) * eased),
        gold: Math.round(start.gold + (target.gold - start.gold) * eased),
        silver: Math.round(start.silver + (target.silver - start.silver) * eased),
        bronze: Math.round(start.bronze + (target.bronze - start.bronze) * eased),
        winRate: Number((start.winRate + (target.winRate - start.winRate) * eased).toFixed(1)),
        trophyRate: Number((start.trophyRate + (target.trophyRate - start.trophyRate) * eased).toFixed(1)),
      });

      if (progress < 1) {
        rafId = requestAnimationFrame(tick);
      } else {
        setAnimatedStats({
          leagues: target.leagues,
          gold: target.gold,
          silver: target.silver,
          bronze: target.bronze,
          winRate: Number(target.winRate.toFixed(1)),
          trophyRate: Number(target.trophyRate.toFixed(1)),
        });
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [stats]);

  const meetsTier = (tier: RankTier) =>
    userLeagues >= tier.leagues &&
    userMedals >= tier.medals &&
    userWinRate >= tier.winRate &&
    userTrophyRate >= tier.trophyRate;

  const currentTierIndexAsc = (() => {
    let idx = 0;
    for (let i = 0; i < RANK_TIERS_ASC.length; i++) {
      if (meetsTier(RANK_TIERS_ASC[i])) idx = i;
      else break;
    }
    return idx;
  })();
  const nextTierIndexAsc = Math.min(currentTierIndexAsc + 1, RANK_TIERS_ASC.length - 1);
  const rankRowsDesc = [...RANK_TIERS_ASC].reverse();
  const currentTierName = RANK_TIERS_ASC[currentTierIndexAsc]?.name || "Intern";

  return (
    <div className="px-4 py-6 space-y-4">
      <div className="space-y-3">
        <div className="card-3d rounded-xl px-3.5 pt-3 pb-2 bg-gradient-to-r from-[#2a3340]/85 via-[#1E2830]/85 to-[#2a3340]/85 border border-white/20">
          <div className="mb-2.5 flex items-center gap-3">
            <div className="h-9 w-9 rounded-full overflow-hidden border border-white/20 bg-white/5 shrink-0 flex items-center justify-center">
              {user?.avatar ? (
                <img src={user.avatar} alt="Profile" className="h-full w-full object-cover" />
              ) : (
                <span className="text-sm font-semibold text-gray-300">
                  {user?.username?.[0]?.toUpperCase?.() || "U"}
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] uppercase tracking-[0.12em] text-gray-400">User Card</p>
              <p className="text-sm font-semibold text-white truncate">
                {user?.username || "User"}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-[10px] uppercase tracking-[0.12em] text-gray-400">Current Level</p>
              <p className="mt-0.5 text-sm font-semibold text-white tracking-wide leading-tight">{currentTierName}</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2.5 mb-3">
          <div className="card-3d bg-gray-800/60 rounded-xl py-2.5 text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Users className="w-4 h-4 text-blue-300" />
            </div>
            <div className="text-xl font-bold text-white">{animatedStats.leagues}</div>
            <div className="text-[10px] text-gray-400/80 font-medium">LEAGUES</div>
          </div>
          <div className="card-3d bg-yellow-500/10 border border-yellow-500/20 rounded-xl py-2.5 text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Award className="w-4 h-4 text-yellow-400" />
            </div>
            <div className="text-xl font-bold text-yellow-400">{animatedStats.gold}</div>
            <div className="text-[10px] text-yellow-400/70 font-medium">GOLD</div>
          </div>
          <div className="card-3d bg-gray-400/10 border border-gray-400/20 rounded-xl py-2.5 text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Medal className="w-4 h-4 text-gray-300" />
            </div>
            <div className="text-xl font-bold text-gray-300">{animatedStats.silver}</div>
            <div className="text-[10px] text-gray-400/70 font-medium">SILVER</div>
          </div>
          <div className="card-3d bg-orange-600/10 border border-orange-600/20 rounded-xl py-2.5 text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Medal className="w-4 h-4 text-orange-400" />
            </div>
            <div className="text-xl font-bold text-orange-400">{animatedStats.bronze}</div>
            <div className="text-[10px] text-orange-500/70 font-medium">BRONZE</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <div className="card-3d bg-gray-800/60 rounded-xl py-2.5 text-center">
            <div className="text-lg font-bold text-white">{animatedStats.winRate.toFixed(1)}%</div>
            <div className="text-[10px] text-gray-400 font-medium">WIN RATE</div>
          </div>
          <div className="card-3d bg-gray-800/60 rounded-xl py-2.5 text-center">
            <div className="text-lg font-bold text-white">{animatedStats.trophyRate.toFixed(1)}%</div>
            <div className="text-[10px] text-gray-400 font-medium">MEDAL RATE</div>
          </div>
        </div>

        <div className="pt-2">
          <h3 className="text-[10px] text-gray-400 uppercase tracking-[0.12em] font-medium mb-2">
            Rank Progression
          </h3>

          <div className="grid grid-cols-[minmax(0,1fr)_repeat(4,56px)] gap-2 px-2 py-1 mb-2">
            <div className="text-[10px] text-gray-500 uppercase tracking-[0.12em]">Tier</div>
            <div className="text-[10px] text-gray-500 uppercase tracking-[0.12em] text-center">Leagues</div>
            <div className="text-[10px] text-gray-500 uppercase tracking-[0.12em] text-center">Medals</div>
            <div className="text-[10px] text-gray-500 uppercase tracking-[0.12em] text-center">Win Rate</div>
            <div className="text-[10px] text-gray-500 uppercase tracking-[0.12em] text-center">Medal Rate</div>
          </div>

          <div className="space-y-2">
            {rankRowsDesc.map((tier) => {
              const tierIndexAsc = RANK_TIERS_ASC.findIndex((t) => t.name === tier.name);
              const isCurrent = tierIndexAsc === currentTierIndexAsc;
              const isNext = tierIndexAsc === nextTierIndexAsc && !isCurrent;
              const isLockedAboveCurrent = tierIndexAsc > currentTierIndexAsc;
              const isDimmed = isLockedAboveCurrent && !isNext;

              const leaguesMet = userLeagues >= tier.leagues;
              const medalsMet = userMedals >= tier.medals;
              const winRateMet = userWinRate >= tier.winRate;
              const trophyRateMet = userTrophyRate >= tier.trophyRate;

              const criterionCell = (value: string, met: boolean) => (
                <div
                  className={`h-[52px] rounded-lg px-1.5 py-1 text-center border flex flex-col items-center justify-between ${
                    met
                      ? "bg-[#0a1f12] border-green-500/50 text-green-400"
                      : "bg-[#121920] border-white/10 text-gray-300"
                  }`}
                >
                  <div className="text-xs font-semibold leading-tight">{value}</div>
                  <div className="mt-1 flex items-center justify-center">
                    {met ? (
                      <span className="h-3.5 w-3.5 rounded-full bg-green-500 text-[10px] leading-[14px] text-black font-bold">
                        ✓
                      </span>
                    ) : (
                      <span className="text-[11px] text-gray-500 leading-none">-</span>
                    )}
                  </div>
                </div>
              );

              return (
                <div
                  key={tier.name}
                  className={`relative grid grid-cols-[minmax(0,1fr)_repeat(4,56px)] gap-2 items-stretch rounded-xl px-2 py-2 bg-[#1E2830]/70 border ${
                    isCurrent
                      ? "border-[#F0B429] bg-[#2a2112]/70"
                      : "border-white/10"
                  } ${isDimmed ? "opacity-40" : "opacity-100"}`}
                >
                  <div className="relative flex items-center text-left text-sm text-white font-medium">
                    {tier.name}
                  </div>
                  {criterionCell(String(tier.leagues), leaguesMet)}
                  {criterionCell(String(tier.medals), medalsMet)}
                  {criterionCell(`${tier.winRate}%`, winRateMet)}
                  {criterionCell(`${tier.trophyRate}%`, trophyRateMet)}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
