import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Player } from "@shared/schema";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

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

export function PlayerNameCardTrigger({ player, className }: PlayerNameCardTriggerProps) {
  const [open, setOpen] = useState(false);

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
          <DialogHeader>
            <DialogTitle className="text-white text-base">{player.name}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-16 h-16 rounded-full overflow-hidden bg-gray-800 border border-gray-700 shrink-0">
                {player.avatar ? (
                  <img src={player.avatar} alt={player.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-xl font-semibold text-gray-400">
                    {player.name.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <p className="text-sm text-gray-300">{player.teamAbbreviation || player.team || "-"}</p>
                <p className="text-sm text-blue-300">{player.position || "-"}</p>
              </div>
            </div>

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
