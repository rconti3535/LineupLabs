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
  const imageCandidates = useMemo(() => buildHeadshotCandidates(player), [player]);
  const [imageSrcIndex, setImageSrcIndex] = useState(0);
  const teamLogoUrl = useMemo(() => getTeamLogoUrl(player.teamAbbreviation || null), [player.teamAbbreviation]);

  useEffect(() => {
    setImageSrcIndex(0);
  }, [player.id, player.avatar, player.mlbId]);

  const { data: news = [], isFetching: newsLoading } = useQuery<NewsItem[]>({
    queryKey: ["/api/player-card/news", player.id, player.name, player.teamAbbreviation],
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
    () => getPlayerNews(news, player.name, player.teamAbbreviation || player.team || null),
    [news, player.name, player.teamAbbreviation, player.team],
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

  const isPitcher = isPitcherPosition(player.position);
  const coreStats = isPitcher
    ? [
        { label: "W", value: player.statW },
        { label: "SV", value: player.statSV },
        { label: "ERA", value: player.statERA },
        { label: "WHIP", value: player.statWHIP },
        { label: "SO", value: player.statSO },
        { label: "IP", value: player.statIP },
      ]
    : [
        { label: "R", value: player.statR },
        { label: "HR", value: player.statHR },
        { label: "RBI", value: player.statRBI },
        { label: "SB", value: player.statSB },
        { label: "AVG", value: player.statAVG },
        { label: "OPS", value: player.statOPS },
      ];

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
        {player.name}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-gray-900 border-gray-700 text-white max-w-md p-4 sm:p-5">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-16 h-16 rounded-full overflow-hidden bg-gray-800 border border-gray-700 shrink-0">
                {imageCandidates[imageSrcIndex] ? (
                  <img
                    src={imageCandidates[imageSrcIndex]}
                    alt={player.name}
                    className="w-full h-full object-cover"
                    onError={() => {
                      setImageSrcIndex((prev) => {
                        if (prev < imageCandidates.length - 1) return prev + 1;
                        return prev;
                      });
                    }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-xl font-semibold text-gray-400">
                    {player.name.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1 text-right">
                <p className="text-lg font-semibold text-white truncate">{player.name}</p>
                <div className="mt-1 flex items-center justify-end gap-2.5">
                  {teamLogoUrl && (
                    <img
                      src={teamLogoUrl}
                      alt={`${player.teamAbbreviation || player.team || "Team"} logo`}
                      className="w-5 h-5 object-contain"
                    />
                  )}
                  <p className="text-sm text-blue-300">{player.position || "-"}</p>
                  <p className="text-sm text-gray-300">{player.teamAbbreviation || player.team || "-"}</p>
                </div>
              </div>
            </div>

            {leagueId && (
              <div>
                <p className="text-[11px] uppercase tracking-wide text-gray-400 mb-1.5">Rostered By</p>
                {holderLoading ? (
                  <p className="text-xs text-gray-500">Loading owner...</p>
                ) : holderInfo ? (
                  <p className="text-sm text-white">
                    {holderInfo.userName || holderInfo.teamName}
                    <span className="text-gray-400"> ({holderInfo.teamName})</span>
                  </p>
                ) : (
                  <p className="text-xs text-gray-500">Available (not rostered in this league)</p>
                )}
              </div>
            )}

            <div>
              <p className="text-[11px] uppercase tracking-wide text-gray-400 mb-2">Stats</p>
              <div className="grid grid-cols-3 gap-2">
                {coreStats.map((s) => (
                  <div key={s.label} className="rounded-lg bg-gray-800/70 border border-gray-700 px-2 py-1.5 text-center">
                    <p className="text-[10px] text-gray-400">{s.label}</p>
                    <p className="text-sm font-semibold text-white">{statDisplay(s.value)}</p>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="text-[11px] uppercase tracking-wide text-gray-400 mb-2">News</p>
              {newsLoading ? (
                <p className="text-xs text-gray-500">Loading news...</p>
              ) : playerNews.length > 0 ? (
                <div className="space-y-2.5 max-h-44 overflow-auto pr-1">
                  {playerNews.map((item, idx) => (
                    <a
                      key={`${item.link}-${idx}`}
                      href={item.link}
                      target="_blank"
                      rel="noreferrer"
                      className="block text-xs text-gray-200 hover:text-blue-300"
                    >
                      {item.title}
                    </a>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-500">No recent news found for this player.</p>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
