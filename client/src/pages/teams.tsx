import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { TeamCard } from "@/components/teams/team-card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import type { Team, League, DraftPick } from "@shared/schema";
import { queryClient } from "@/lib/queryClient";
import { useLocation } from "wouter";

type NewsFeedResponse = {
  source: string;
  items: {
    title: string;
    link: string;
    pubDate: string | null;
    author: string | null;
    imageUrl: string | null;
    teamAbbreviation: string | null;
    teamLogoUrl: string | null;
  }[];
};

export default function Teams() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { data: teams, isLoading } = useQuery<Team[]>({
    queryKey: ["/api/teams/user", user?.id],
    queryFn: async () => {
      const res = await fetch(`/api/teams/user/${user?.id}`);
      if (!res.ok) throw new Error("Failed to fetch teams");
      return res.json();
    },
    enabled: !!user?.id,
  });

  const leagueIds = teams?.map((t) => t.leagueId).filter(Boolean) || [];

  const { data: leagues, isLoading: leaguesLoading } = useQuery<League[]>({
    queryKey: ["/api/leagues/batch", ...leagueIds],
    queryFn: async () => {
      const results = await Promise.all(
        leagueIds.map((id) =>
          fetch(`/api/leagues/${id}`).then((r) => (r.ok ? r.json() : null))
        )
      );
      return results.filter(Boolean);
    },
    enabled: leagueIds.length > 0,
    staleTime: 0,
    refetchInterval: 10000,
    refetchOnWindowFocus: true,
  });

  const leagueMap = new Map<number, {
    name: string;
    isPublic: boolean;
    createdBy: number | null;
    leagueImage: string | null;
    draftStatus: string | null;
    type: string | null;
    maxTeams: number | null;
    scoringFormat: string | null;
  }>();
  leagues?.forEach((l) => leagueMap.set(l.id, {
    name: l.name,
    isPublic: l.isPublic ?? false,
    createdBy: l.createdBy,
    leagueImage: l.leagueImage,
    draftStatus: l.draftStatus,
    type: l.type,
    maxTeams: l.maxTeams,
    scoringFormat: l.scoringFormat,
  }));

  const liveLeagueIds = (leagues || [])
    .filter(l => l.draftStatus === "active")
    .map(l => l.id);

  const { data: liveTurnMap } = useQuery<Record<number, number | null>>({
    queryKey: ["/api/teams/live-turn-map", ...liveLeagueIds],
    queryFn: async () => {
      const entries = await Promise.all(
        liveLeagueIds.map(async (leagueId) => {
          const [teamsRes, picksRes] = await Promise.all([
            fetch(`/api/teams/league/${leagueId}`),
            fetch(`/api/leagues/${leagueId}/draft-picks`),
          ]);
          if (!teamsRes.ok || !picksRes.ok) return [leagueId, null] as const;

          const leagueTeams: Team[] = await teamsRes.json();
          const picks: DraftPick[] = await picksRes.json();
          const league = leagues?.find(l => l.id === leagueId);
          if (!league || leagueTeams.length === 0) return [leagueId, null] as const;

          const sortedTeams = [...leagueTeams].sort((a, b) => (a.draftPosition || 999) - (b.draftPosition || 999));
          const numTeams = sortedTeams.length;
          const totalRounds = league.maxRosterSize || (league.rosterPositions || []).length;
          const highestOverallPick = picks.reduce((max, pick) => Math.max(max, pick.overallPick || 0), 0);
          const nextOverall = highestOverallPick + 1;
          if (nextOverall > totalRounds * numTeams) return [leagueId, null] as const;

          const round = Math.ceil(nextOverall / numTeams);
          const pickInRound = ((nextOverall - 1) % numTeams) + 1;
          const isOddRound = round % 2 === 1;
          const teamIndex = isOddRound ? pickInRound - 1 : numTeams - pickInRound;
          const pickingTeam = sortedTeams[teamIndex];

          return [leagueId, pickingTeam?.id ?? null] as const;
        })
      );

      return Object.fromEntries(entries);
    },
    enabled: liveLeagueIds.length > 0,
    refetchInterval: 2000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  useEffect(() => {
    if (liveLeagueIds.length === 0) return;

    const sources: EventSource[] = [];
    const reconnectTimers: ReturnType<typeof setTimeout>[] = [];
    let closed = false;

    const connectLeague = (leagueId: number) => {
      const es = new EventSource(`/api/leagues/${leagueId}/draft-events`);
      sources.push(es);

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "pick" || data.type === "draft-status" || data.type === "teams-update" || data.type === "league-settings") {
            queryClient.refetchQueries({ queryKey: ["/api/teams/live-turn-map"] });
            queryClient.refetchQueries({ queryKey: ["/api/leagues", leagueId, "draft-picks"] });
            queryClient.refetchQueries({ queryKey: ["/api/leagues/batch"] });
          }
        } catch {
          // Ignore malformed SSE payloads.
        }
      };

      es.onerror = () => {
        es.close();
        if (!closed) {
          const timer = setTimeout(() => connectLeague(leagueId), 3000);
          reconnectTimers.push(timer);
        }
      };
    };

    liveLeagueIds.forEach(connectLeague);

    return () => {
      closed = true;
      sources.forEach((es) => es.close());
      reconnectTimers.forEach((t) => clearTimeout(t));
    };
  }, [liveLeagueIds.join(",")]);

  const showSkeleton = isLoading || (teams && teams.length > 0 && leagueIds.length > 0 && leaguesLoading);

  const { data: rotowireNews, isLoading: rotowireLoading } = useQuery<NewsFeedResponse>({
    queryKey: ["/api/news", "rotowire"],
    queryFn: async () => {
      const res = await fetch("/api/news/rotowire");
      if (!res.ok) throw new Error("Failed to fetch Rotowire news");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
  });

  const { data: espnNews, isLoading: espnLoading } = useQuery<NewsFeedResponse>({
    queryKey: ["/api/news", "espn"],
    queryFn: async () => {
      const res = await fetch("/api/news/espn");
      if (!res.ok) throw new Error("Failed to fetch ESPN news");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
  });

  return (
    <div className="px-2 py-6">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-white">My Leagues</h1>
        <div className="h-9 w-9 rounded-full overflow-hidden border border-white/15 bg-white/5 flex items-center justify-center">
          {user?.avatar ? (
            <img src={user.avatar} alt="Profile" className="h-full w-full object-cover" />
          ) : (
            <span className="text-sm font-semibold text-gray-300">
              {user?.username?.[0]?.toUpperCase?.() || "U"}
            </span>
          )}
        </div>
      </div>

      <div className="space-y-3">
        {showSkeleton ? (
          Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="league-card rounded-xl p-4 border border-white/15 bg-white/[0.03] backdrop-blur-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_6px_16px_rgba(0,0,0,0.25)]">
              <div className="flex items-center space-x-3">
                <Skeleton className="w-10 h-10 rounded-lg" />
                <div className="flex-1">
                  <Skeleton className="h-4 w-32 mb-1" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
            </div>
          ))
        ) : teams && teams.length > 0 ? (
          teams.map((team) => (
            <TeamCard
              key={team.id}
              team={team}
              leagueName={leagueMap.get(team.leagueId!)?.name}
              isPublic={leagueMap.get(team.leagueId!)?.isPublic}
              isCommissioner={leagueMap.get(team.leagueId!)?.createdBy === user?.id}
              leagueImage={leagueMap.get(team.leagueId!)?.leagueImage}
              leagueType={leagueMap.get(team.leagueId!)?.type}
              maxTeams={leagueMap.get(team.leagueId!)?.maxTeams}
              scoringFormat={leagueMap.get(team.leagueId!)?.scoringFormat}
              draftLive={leagueMap.get(team.leagueId!)?.draftStatus === "active"}
              userTurn={!!team.leagueId && !!liveTurnMap && liveTurnMap[team.leagueId] === team.id}
            />
          ))
        ) : (
          <div className="league-card rounded-xl p-8 text-center border border-white/15 bg-white/[0.03] backdrop-blur-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_6px_16px_rgba(0,0,0,0.25)]">
            <p className="text-gray-400 mb-4">You don't have any teams yet</p>
            <p className="text-sm text-gray-500">Join a league to create your first team</p>
          </div>
        )}
      </div>

      <div className="mt-6 pt-4 border-t border-white/10">
        <div className="league-card rounded-xl p-3 border border-white/15 bg-white/[0.03] backdrop-blur-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_6px_16px_rgba(0,0,0,0.25)]">
          <div className="grid grid-cols-2 gap-[10px]">
            <button
              data-hero-card
              type="button"
              onClick={() => setLocation("/create-league")}
              className="rounded-xl border border-green-400/40 bg-gradient-to-br from-green-500/45 to-green-700/45 px-4 py-4 text-left text-white backdrop-blur-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_6px_16px_rgba(0,0,0,0.25)] transition-all duration-200 hover:-translate-y-0.5 hover:from-green-500/55 hover:to-green-700/55 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_9px_20px_rgba(0,0,0,0.32)] active:scale-[0.97]"
            >
              <h3 className="text-lg font-semibold text-white">Create League</h3>
              <p className="mt-1 text-[10px] uppercase tracking-[0.12em] text-gray-100/90">Start fresh</p>
            </button>

            <button
              data-hero-card
              type="button"
              onClick={() => setLocation("/join-public")}
              className="rounded-xl border border-blue-400/40 bg-gradient-to-br from-blue-500/45 to-blue-700/45 px-4 py-4 text-left text-white backdrop-blur-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_6px_16px_rgba(0,0,0,0.25)] transition-all duration-200 hover:-translate-y-0.5 hover:from-blue-500/55 hover:to-blue-700/55 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_9px_20px_rgba(0,0,0,0.32)] active:scale-[0.97]"
            >
              <h3 className="text-lg font-semibold text-white">Join Public</h3>
              <p className="mt-1 text-[10px] uppercase tracking-[0.12em] text-gray-100/90">Find a spot</p>
            </button>
          </div>
        </div>
      </div>

      <div className="mt-6 space-y-4">
        <div className="league-card rounded-xl p-4 border border-white/15 bg-white/[0.03] backdrop-blur-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_6px_16px_rgba(0,0,0,0.25)]">
          <h3 className="text-white font-semibold mb-3">Rotowire News</h3>
          <div className="space-y-2">
            {rotowireLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-10 rounded-lg bg-gray-800/70" />
              ))
            ) : (rotowireNews?.items || []).length > 0 ? (
              rotowireNews!.items.map((item, idx) => (
                <a
                  key={`${item.link}-${idx}`}
                  href={item.link}
                  target="_blank"
                  rel="noreferrer"
                  className="block rounded-xl border border-white/30 bg-gradient-to-br from-[#4b5563]/62 via-[#6b7280]/45 to-[#9ca3af]/28 px-3 py-2 text-left text-white backdrop-blur-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.24),inset_0_-2px_6px_rgba(0,0,0,0.28),0_10px_24px_rgba(0,0,0,0.35),0_2px_6px_rgba(0,0,0,0.28)] transition-all duration-200 hover:-translate-y-0.5 hover:from-[#6b7280]/68 hover:via-[#9ca3af]/44 hover:to-[#cbd5e1]/30 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.3),inset_0_-2px_7px_rgba(0,0,0,0.32),0_14px_30px_rgba(0,0,0,0.42),0_3px_8px_rgba(0,0,0,0.3)] active:scale-[0.97]"
                >
                  <div className="flex items-start gap-2.5">
                    <div className="w-7 h-7 shrink-0 mt-0.5 flex items-center justify-center">
                      {item.teamLogoUrl ? (
                        <img
                          src={item.teamLogoUrl}
                          alt={item.teamAbbreviation || "MLB"}
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <span className="text-[10px] text-gray-400">MLB</span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm text-white leading-5">
                        {item.title}{" "}
                        {item.author && (
                          <span className="text-[11px] text-gray-500 whitespace-nowrap">
                            {`By ${item.author}`}
                          </span>
                        )}
                      </p>
                    </div>
                    {item.imageUrl && (
                      <img
                        src={item.imageUrl}
                        alt="Article"
                        className="w-14 h-14 shrink-0 rounded-md object-cover border border-white/15"
                      />
                    )}
                  </div>
                </a>
              ))
            ) : (
              <p className="text-sm text-gray-500">No Rotowire news available right now.</p>
            )}
          </div>
        </div>

        <div className="league-card rounded-xl p-4 border border-white/15 bg-white/[0.03] backdrop-blur-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_6px_16px_rgba(0,0,0,0.25)]">
          <h3 className="text-white font-semibold mb-3">ESPN News</h3>
          <div className="space-y-2">
            {espnLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-10 rounded-lg bg-gray-800/70" />
              ))
            ) : (espnNews?.items || []).length > 0 ? (
              espnNews!.items.map((item, idx) => (
                <a
                  key={`${item.link}-${idx}`}
                  href={item.link}
                  target="_blank"
                  rel="noreferrer"
                  className="block rounded-xl border border-white/30 bg-gradient-to-br from-[#4b5563]/62 via-[#6b7280]/45 to-[#9ca3af]/28 px-3 py-2 text-left text-white backdrop-blur-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.24),inset_0_-2px_6px_rgba(0,0,0,0.28),0_10px_24px_rgba(0,0,0,0.35),0_2px_6px_rgba(0,0,0,0.28)] transition-all duration-200 hover:-translate-y-0.5 hover:from-[#6b7280]/68 hover:via-[#9ca3af]/44 hover:to-[#cbd5e1]/30 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.3),inset_0_-2px_7px_rgba(0,0,0,0.32),0_14px_30px_rgba(0,0,0,0.42),0_3px_8px_rgba(0,0,0,0.3)] active:scale-[0.97]"
                >
                  <div className="flex items-start gap-2.5">
                    <div className="w-7 h-7 shrink-0 mt-0.5 flex items-center justify-center">
                      {item.teamLogoUrl ? (
                        <img
                          src={item.teamLogoUrl}
                          alt={item.teamAbbreviation || "MLB"}
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <span className="text-[10px] text-gray-400">MLB</span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm text-white leading-5">
                        {item.title}{" "}
                        {item.author && (
                          <span className="text-[11px] text-gray-500 whitespace-nowrap">
                            {`By ${item.author}`}
                          </span>
                        )}
                      </p>
                    </div>
                    {item.imageUrl && (
                      <img
                        src={item.imageUrl}
                        alt="Article"
                        className="w-14 h-14 shrink-0 rounded-md object-cover border border-white/15"
                      />
                    )}
                  </div>
                </a>
              ))
            ) : (
              <p className="text-sm text-gray-500">No ESPN news available right now.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
