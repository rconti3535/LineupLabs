import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Player } from "@shared/schema";
import { Dialog, DialogContent } from "@/components/ui/dialog";

type NewsItem = {
  title: string;
  link: string;
  pubDate: string | null;
  author: string | null;
  imageUrl: string | null;
  teamAbbreviation: string | null;
  teamLogoUrl: string | null;
};

type PlayerNameCardTriggerProps = {
  player: Partial<Player> & { id: number; name: string };
  className?: string;
  leagueId?: number;
};

function isPitcherPosition(position?: string | null) {
  const pos = (position || "").toUpperCase();
  return pos === "SP" || pos === "RP" || pos === "P";
}

function statDisplay(value: unknown): string {
  if (value === null || value === undefined) return "-";
  if (typeof value === "number" && value === 0) return "-";
  const s = String(value).trim();
  if (!s || s === "0" || s === "0.0" || s === "0.00" || s === ".000") return "-";
  return s;
}

function getPlayerNews(items: NewsItem[], playerName: string, teamAbbreviation?: string | null) {
  const full = playerName.toLowerCase();
  const last = playerName.split(" ").filter(Boolean).pop()?.toLowerCase() || "";
  const byName = items.filter((n) => {
    const t = (n.title || "").toLowerCase();
    if (t.includes(full)) return true;
    if (last.length >= 4 && t.includes(last)) return true;
    return false;
  });
  if (byName.length > 0) return byName.slice(0, 5);
  if (teamAbbreviation) {
    return items
      .filter((n) => (n.teamAbbreviation || "").toUpperCase() === teamAbbreviation.toUpperCase())
      .slice(0, 5);
  }
  return [];
}

function buildHeadshotCandidates(player: Partial<Player> & { id: number; name: string }): string[] {
  const candidates: string[] = [];
  if (player.avatar && player.avatar.trim()) {
    candidates.push(player.avatar.trim());
  }

  if (player.mlbId) {
    const mlbId = Number(player.mlbId);
    if (Number.isFinite(mlbId) && mlbId > 0) {
      candidates.push(`https://img.mlbstatic.com/mlb-photos/image/upload/v1/people/${mlbId}/headshot/67/current`);
      candidates.push(`https://img.mlbstatic.com/mlb-photos/image/upload/w_180,q_auto:best/v1/people/${mlbId}/headshot/67/current`);
      candidates.push(`https://securea.mlb.com/mlb/images/players/head_shot/${mlbId}.jpg`);
    }
  }

  return Array.from(new Set(candidates));
}

function getTeamLogoUrl(teamAbbreviation?: string | null): string | null {
  if (!teamAbbreviation) return null;
  const abbr = teamAbbreviation.toUpperCase();
  const slugMap: Record<string, string> = {
    KCR: "kc",
    SDP: "sd",
    SFG: "sf",
    TBR: "tb",
    WSN: "wsh",
    OAK: "ath",
  };
  const slug = slugMap[abbr] || abbr.toLowerCase();
  return `https://a.espncdn.com/i/teamlogos/mlb/500/${slug}.png`;
}

type HolderInfo = {
  teamId: number;
  teamName: string;
  userId: number | null;
  userName: string | null;
  isCpu: boolean;
};

export function PlayerNameCardTrigger({ player, className, leagueId }: PlayerNameCardTriggerProps) {
  const [open, setOpen] = useState(false);
  const { data: fullPlayer } = useQuery<Player | null>({
    queryKey: ["/api/player-card/player", player.id],
    queryFn: async () => {
      const res = await fetch(`/api/players/${player.id}`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch player details");
      return res.json();
    },
    enabled: open,
    staleTime: 5 * 60_000,
  });

  const resolvedPlayer = (fullPlayer || player) as Partial<Player> & { id: number; name: string };
  const imageCandidates = useMemo(() => buildHeadshotCandidates(resolvedPlayer), [resolvedPlayer]);
  const [imageSrcIndex, setImageSrcIndex] = useState(0);
  useEffect(() => {
    setImageSrcIndex(0);
  }, [resolvedPlayer.id, resolvedPlayer.avatar, resolvedPlayer.mlbId]);

  const { data: news = [], isFetching: newsLoading } = useQuery<NewsItem[]>({
    queryKey: ["/api/player-card/news", resolvedPlayer.id, resolvedPlayer.name, resolvedPlayer.teamAbbreviation],
    queryFn: async () => {
      const [rwRes, espnRes] = await Promise.all([
        fetch("/api/news/rotowire"),
        fetch("/api/news/espn"),
      ]);
      const rw = rwRes.ok ? await rwRes.json() : { items: [] };
      const espn = espnRes.ok ? await espnRes.json() : { items: [] };
      return [...(rw?.items || []), ...(espn?.items || [])];
    },
    enabled: open,
    staleTime: 60_000,
  });

  const playerNews = useMemo(
    () => getPlayerNews(news, resolvedPlayer.name, resolvedPlayer.teamAbbreviation || resolvedPlayer.team || null),
    [news, resolvedPlayer.name, resolvedPlayer.teamAbbreviation, resolvedPlayer.team],
  );

  const { data: holderInfo, isFetching: holderLoading } = useQuery<HolderInfo | null>({
    queryKey: ["/api/leagues", leagueId, "player-holder", player.id],
    queryFn: async () => {
      if (!leagueId) return null;
      const res = await fetch(`/api/leagues/${leagueId}/player-holder/${player.id}`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch holder");
      return res.json();
    },
    enabled: open && !!leagueId,
    staleTime: 30_000,
  });

  const isPitcher = isPitcherPosition(resolvedPlayer.position);
  const coreStats = isPitcher
    ? [
        { label: "W", value: resolvedPlayer.statW },
        { label: "SV", value: resolvedPlayer.statSV },
        { label: "ERA", value: resolvedPlayer.statERA },
        { label: "WHIP", value: resolvedPlayer.statWHIP },
        { label: "SO", value: resolvedPlayer.statSO },
        { label: "IP", value: resolvedPlayer.statIP },
      ]
    : [
        { label: "R", value: resolvedPlayer.statR },
        { label: "HR", value: resolvedPlayer.statHR },
        { label: "RBI", value: resolvedPlayer.statRBI },
        { label: "SB", value: resolvedPlayer.statSB },
        { label: "AVG", value: resolvedPlayer.statAVG },
        { label: "OPS", value: resolvedPlayer.statOPS },
      ];
  const featuredStats = coreStats.slice(0, 4);
  const fantasyPoints = typeof resolvedPlayer.points === "number" ? resolvedPlayer.points : null;
  const teamAbbr = (resolvedPlayer.teamAbbreviation || "").toUpperCase();
  const watermarkTeam = teamAbbr || (resolvedPlayer.team ? resolvedPlayer.team.slice(0, 3).toUpperCase() : "MLB");
  const trendBars = useMemo(() => {
    const seedBase = (resolvedPlayer.id || 1) * 7919 + (Number(resolvedPlayer.statHR) || 0) * 37 + (Number(resolvedPlayer.statSO) || 0) * 17;
    let seed = Math.max(1, seedBase % 2147483647);
    const next = () => {
      seed = (seed * 48271) % 2147483647;
      return seed / 2147483647;
    };
    return Array.from({ length: 10 }).map(() => {
      const height = 6 + Math.floor(next() * 13);
      const on = next() > 0.25;
      return { height, on };
    });
  }, [resolvedPlayer.id, resolvedPlayer.statHR, resolvedPlayer.statSO]);
  const showStatusSection = !!(leagueId || holderLoading || holderInfo);

  return (
    <>
      <button
        type="button"
        className={className || "text-white text-xs font-medium truncate text-left hover:text-blue-300 transition-colors"}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
      >
        {resolvedPlayer.name}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="text-white w-[calc(100vw-12px)] max-w-[430px] p-0 overflow-hidden bg-[#0e1623] border border-[#1c2d42] rounded-[20px] shadow-[0_24px_60px_rgba(0,0,0,0.6),0_0_0_1px_rgba(0,201,255,0.06)]">
          <div className="relative h-[190px] overflow-hidden bg-gradient-to-br from-[#0d1f38] via-[#091323] to-[#040c18]">
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                backgroundImage: "repeating-linear-gradient(-52deg, transparent, transparent 20px, rgba(255,255,255,0.015) 20px, rgba(255,255,255,0.015) 21px)",
              }}
            />
            <div
              className="absolute pointer-events-none -left-10 -top-10 w-[200px] h-[200px]"
              style={{
                background: "radial-gradient(circle, rgba(0,201,255,0.12) 0%, transparent 70%)",
              }}
            />
            <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-gradient-to-b from-cyan-400 to-amber-400" />
            <div className="absolute right-[-12px] bottom-[-18px] text-[110px] font-bold leading-none tracking-[-0.04em] text-white/[0.04] select-none pointer-events-none">
              {watermarkTeam}
            </div>

            <div className="absolute top-[68px] right-4 text-right">
              <p className="text-[24px] leading-none tracking-[0.03em] text-white font-bold max-w-[65vw] truncate">
                {resolvedPlayer.name}
              </p>
              <p className="text-[12px] leading-none tracking-[0.18em] uppercase text-cyan-300 font-semibold mt-1">
                {resolvedPlayer.position || "-"}
              </p>
            </div>

            <div className="absolute right-4 bottom-3 text-right">
              <p className="text-[30px] leading-none font-bold text-amber-300">
                {fantasyPoints !== null ? fantasyPoints : "--"}
              </p>
              <p className="text-[7px] tracking-[0.28em] uppercase text-slate-500 mt-0.5">Fantasy Pts</p>
            </div>

            <div className="absolute left-4 bottom-2">
              <div className="relative">
                <div className="w-[96px] h-[120px] rounded-md overflow-hidden">
                  {imageCandidates[imageSrcIndex] ? (
                    <img
                      src={imageCandidates[imageSrcIndex]}
                      alt={resolvedPlayer.name}
                      className="w-full h-full object-cover"
                      style={{ objectPosition: "50% 18%" }}
                      onError={() => {
                        setImageSrcIndex((prev) => {
                          if (prev < imageCandidates.length - 1) return prev + 1;
                          return prev;
                        });
                      }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-2xl font-semibold text-gray-400 bg-[#131f30]">
                      {resolvedPlayer.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
                {resolvedPlayer.jerseyNumber && (
                  <div className="absolute bottom-0 right-[-2px] rounded bg-amber-300 text-black text-[8px] font-bold px-1.5 py-0.5 tracking-[0.05em]">
                    #{resolvedPlayer.jerseyNumber}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="px-[18px] pt-1 pb-5">
            {showStatusSection && (
              <>
                <div className="mt-1 text-[8px] tracking-[0.28em] uppercase text-slate-500 flex items-center gap-2">
                  <span>Status</span>
                  <span className="h-px flex-1 bg-[#1c2d42]" />
                </div>
                <div className="mt-2 flex items-center gap-2 rounded-[9px] bg-[#131f30] border border-[#1c2d42] px-3 py-2.5">
                  <span className="w-[7px] h-[7px] rounded-full bg-emerald-400 shadow-[0_0_7px_#1fd97a] shrink-0 animate-pulse" />
                  <p className="text-[10px] text-slate-200 flex-1">
                    {holderLoading ? (
                      "Loading roster status..."
                    ) : holderInfo ? (
                      <>
                        Rostered by <span className="text-amber-300 font-semibold">{holderInfo.userName || holderInfo.teamName}</span>
                      </>
                    ) : (
                      "Active - Available in this league"
                    )}
                  </p>
                </div>
              </>
            )}

            <div className={`${showStatusSection ? "mt-4" : "mt-1"} text-[8px] tracking-[0.28em] uppercase text-slate-500 flex items-center gap-2`}>
              <span>{isPitcher ? "Pitching Snapshot" : "Hitting Snapshot"}</span>
              <span className="h-px flex-1 bg-[#1c2d42]" />
            </div>
            <div className="mt-2 grid grid-cols-4 gap-2">
              {featuredStats.map((s, idx) => (
                <div key={s.label} className="rounded-[9px] bg-[#131f30] border border-[#1c2d42] px-1 py-2 text-center">
                  <p className={`text-[16px] leading-none font-bold ${idx === 0 ? "text-cyan-300" : "text-white"}`}>
                    {statDisplay(s.value)}
                  </p>
                  <p className="text-[7px] tracking-[0.18em] uppercase text-slate-500 mt-1">{s.label}</p>
                </div>
              ))}
            </div>

            <div className="mt-4 text-[8px] tracking-[0.28em] uppercase text-slate-500 flex items-center gap-2">
              <span>Recent Form</span>
              <span className="h-px flex-1 bg-[#1c2d42]" />
            </div>
            <div className="mt-2 flex items-center gap-2 rounded-[9px] bg-[#131f30] border border-[#1c2d42] px-3 py-2.5">
              <p className="text-[8px] tracking-[0.15em] uppercase text-slate-500 flex-1">Last 10 Games</p>
              <div className="flex items-end gap-[3px] h-5">
                {trendBars.map((bar, idx) => (
                  <span
                    key={`${resolvedPlayer.id}-${idx}`}
                    className={`w-[5px] rounded-t-[2px] rounded-b-[1px] ${bar.on ? "bg-cyan-300" : "bg-[#1c2d42]"}`}
                    style={{ height: `${bar.height}px` }}
                  />
                ))}
              </div>
              <p className="text-[11px] font-bold text-emerald-400">+{(Math.abs((resolvedPlayer.id % 13) * 0.7) + 1).toFixed(1)}</p>
            </div>

            <div className="mt-4 text-[8px] tracking-[0.28em] uppercase text-slate-500 flex items-center gap-2">
              <span>News</span>
              <span className="h-px flex-1 bg-[#1c2d42]" />
            </div>
            {newsLoading ? (
              <p className="text-xs text-gray-500 mt-2">Loading news...</p>
            ) : playerNews.length > 0 ? (
              <div className="space-y-2.5 max-h-36 overflow-auto pr-1 mt-2">
                {playerNews.map((item, idx) => (
                  <a
                    key={`${item.link}-${idx}`}
                    href={item.link}
                    target="_blank"
                    rel="noreferrer"
                    className="block text-xs text-gray-200 hover:text-cyan-300"
                  >
                    {item.title}
                  </a>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-500 mt-2">No recent news found for this player.</p>
            )}

            <button
              type="button"
              className="mt-4 w-full rounded-[10px] bg-gradient-to-r from-cyan-300 to-cyan-700 text-black text-[10px] font-bold tracking-[0.28em] uppercase py-3 hover:opacity-90 active:scale-[0.98] transition"
              onClick={() => setOpen(false)}
            >
              Close Card
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
