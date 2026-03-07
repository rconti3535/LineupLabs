import type { Express, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertLeagueSchema, insertTeamSchema, insertUserSchema, insertDraftPickSchema, players, playerAdp, teams as teamsTable, users, type Player, type InsertLeagueMatchup } from "@shared/schema";
import { computeRotoStandings } from "./roto-scoring";
import { computeStandings, computeMatchups, finalizeBestBallWeeklySnapshots } from "./scoring";
import { getScheduleForDate, getPlayerGameTimes, type PlayerGameTime } from "./mlb-schedule";
import { addClient, broadcastDraftEvent } from "./draft-events";
import { db } from "./db";
import { eq, ne, and, sql, inArray } from "drizzle-orm";
import { compare, hash } from "bcryptjs";

const INF_POSITIONS = ["1B", "2B", "3B", "SS"];

type NewsItem = {
  title: string;
  link: string;
  pubDate: string | null;
  author: string | null;
  imageUrl: string | null;
  teamAbbreviation: string | null;
  teamLogoUrl: string | null;
};

type MlbTeamMeta = {
  abbr: string;
  espnAbbr: string;
  aliases: string[];
};

const MLB_TEAM_METADATA: MlbTeamMeta[] = [
  { abbr: "ARI", espnAbbr: "ari", aliases: ["arizona", "diamondbacks", "d-backs", "dbacks", "ari"] },
  { abbr: "ATL", espnAbbr: "atl", aliases: ["atlanta", "braves", "atl"] },
  { abbr: "BAL", espnAbbr: "bal", aliases: ["baltimore", "orioles", "bal"] },
  { abbr: "BOS", espnAbbr: "bos", aliases: ["boston", "red sox", "bos"] },
  { abbr: "CHC", espnAbbr: "chc", aliases: ["chicago cubs", "cubs", "chc"] },
  { abbr: "CIN", espnAbbr: "cin", aliases: ["cincinnati", "reds", "cin"] },
  { abbr: "CLE", espnAbbr: "cle", aliases: ["cleveland", "guardians", "cle"] },
  { abbr: "COL", espnAbbr: "col", aliases: ["colorado", "rockies", "col"] },
  { abbr: "CWS", espnAbbr: "cws", aliases: ["chicago white sox", "white sox", "cws"] },
  { abbr: "DET", espnAbbr: "det", aliases: ["detroit", "tigers", "det"] },
  { abbr: "HOU", espnAbbr: "hou", aliases: ["houston", "astros", "hou"] },
  { abbr: "KCR", espnAbbr: "kc", aliases: ["kansas city", "royals", "kcr", "kc"] },
  { abbr: "LAA", espnAbbr: "laa", aliases: ["los angeles angels", "la angels", "angels", "laa"] },
  { abbr: "LAD", espnAbbr: "lad", aliases: ["los angeles dodgers", "la dodgers", "dodgers", "lad"] },
  { abbr: "MIA", espnAbbr: "mia", aliases: ["miami", "marlins", "mia"] },
  { abbr: "MIL", espnAbbr: "mil", aliases: ["milwaukee", "brewers", "mil"] },
  { abbr: "MIN", espnAbbr: "min", aliases: ["minnesota", "twins", "min"] },
  { abbr: "NYM", espnAbbr: "nym", aliases: ["new york mets", "ny mets", "mets", "nym"] },
  { abbr: "NYY", espnAbbr: "nyy", aliases: ["new york yankees", "ny yankees", "yankees", "nyy"] },
  { abbr: "OAK", espnAbbr: "ath", aliases: ["oakland", "athletics", "a's", "as", "oak", "ath"] },
  { abbr: "PHI", espnAbbr: "phi", aliases: ["philadelphia", "phillies", "phi"] },
  { abbr: "PIT", espnAbbr: "pit", aliases: ["pittsburgh", "pirates", "pit"] },
  { abbr: "SDP", espnAbbr: "sd", aliases: ["san diego", "padres", "sdp", "sd"] },
  { abbr: "SEA", espnAbbr: "sea", aliases: ["seattle", "mariners", "sea"] },
  { abbr: "SFG", espnAbbr: "sf", aliases: ["san francisco", "giants", "sfg", "sf"] },
  { abbr: "STL", espnAbbr: "stl", aliases: ["st louis", "st. louis", "cardinals", "stl"] },
  { abbr: "TBR", espnAbbr: "tb", aliases: ["tampa bay", "rays", "tbr", "tb"] },
  { abbr: "TEX", espnAbbr: "tex", aliases: ["texas", "rangers", "tex"] },
  { abbr: "TOR", espnAbbr: "tor", aliases: ["toronto", "blue jays", "tor"] },
  { abbr: "WSN", espnAbbr: "wsh", aliases: ["washington", "nationals", "wsn", "wsh"] },
];

function decodeXmlEntities(input: string): string {
  return input
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");
}

function extractTagValue(xml: string, tag: string): string {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  if (!match) return "";
  return decodeXmlEntities(match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim());
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function inferMlbTeamFromText(text: string): { abbr: string; logoUrl: string } | null {
  const lowered = text.toLowerCase();
  for (const team of MLB_TEAM_METADATA) {
    for (const alias of team.aliases) {
      const regex = new RegExp(`(^|[^a-z0-9])${escapeRegex(alias.toLowerCase())}([^a-z0-9]|$)`, "i");
      if (regex.test(lowered)) {
        return {
          abbr: team.abbr,
          logoUrl: `https://a.espncdn.com/i/teamlogos/mlb/500/${team.espnAbbr}.png`,
        };
      }
    }
  }
  return null;
}

function extractImageUrlFromItemXml(itemXml: string): string | null {
  const mediaContentMatch = itemXml.match(/<media:content\b[^>]*\burl="([^"]+)"[^>]*>/i);
  if (mediaContentMatch?.[1]) return decodeXmlEntities(mediaContentMatch[1]);

  const mediaThumbnailMatch = itemXml.match(/<media:thumbnail\b[^>]*\burl="([^"]+)"[^>]*>/i);
  if (mediaThumbnailMatch?.[1]) return decodeXmlEntities(mediaThumbnailMatch[1]);

  const enclosureTagMatch = itemXml.match(/<enclosure\b([^>]*)>/i);
  if (enclosureTagMatch?.[1]) {
    const attrs = enclosureTagMatch[1];
    const typeMatch = attrs.match(/\btype="([^"]+)"/i);
    const urlMatch = attrs.match(/\burl="([^"]+)"/i);
    const url = urlMatch?.[1] ? decodeXmlEntities(urlMatch[1]) : null;
    const type = (typeMatch?.[1] || "").toLowerCase();
    if (url && (type.startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(url))) return url;
  }

  const description = extractTagValue(itemXml, "description");
  const descriptionImgMatch = description.match(/<img\b[^>]*\bsrc="([^"]+)"[^>]*>/i);
  if (descriptionImgMatch?.[1]) return decodeXmlEntities(descriptionImgMatch[1]);

  return null;
}

function parseRssItems(xml: string, limit = 10): NewsItem[] {
  const items = xml.match(/<item\b[\s\S]*?<\/item>/gi) || [];
  return items
    .map((itemXml) => {
      const title = extractTagValue(itemXml, "title");
      const link = extractTagValue(itemXml, "link");
      const pubDate = extractTagValue(itemXml, "pubDate") || null;
      const description = extractTagValue(itemXml, "description");
      const inferredTeam = inferMlbTeamFromText(`${title} ${description}`);
      return {
        title,
        link,
        pubDate,
        author: extractTagValue(itemXml, "author") || extractTagValue(itemXml, "dc:creator") || null,
        imageUrl: extractImageUrlFromItemXml(itemXml),
        teamAbbreviation: inferredTeam?.abbr || null,
        teamLogoUrl: inferredTeam?.logoUrl || null,
      };
    })
    .filter((item) => item.title && item.link)
    .slice(0, limit);
}

function stripBotFlag<T extends Record<string, unknown>>(user: T): Omit<T, "isBot" | "password"> {
  const { isBot, password, ...rest } = user as any;
  return rest;
}

function getDraftRounds(league: { rosterPositions?: string[] | null; maxRosterSize?: number | null }): number {
  return league.maxRosterSize || (league.rosterPositions || []).length;
}

function canFitSlot(playerPos: string, slotPos: string, isBestBall = false): boolean {
  if (slotPos === "BN" || slotPos === "IL") return true;
  if (slotPos === "UT") return !["SP", "RP"].includes(playerPos);
  if (slotPos === "P") return ["SP", "RP"].includes(playerPos);
  if (slotPos === "OF") {
    if (["OF", "LF", "CF", "RF"].includes(playerPos)) return true;
    if (isBestBall && ["DH", "UT"].includes(playerPos)) return true;
    return false;
  }
  if (slotPos === "INF") return INF_POSITIONS.includes(playerPos);
  return playerPos === slotPos;
}

function getEarliestGameTime(schedule: Map<string, { gameDate: string }>): Date | null {
  let earliest: Date | null = null;
  const values = Array.from(schedule.values());
  for (let i = 0; i < values.length; i++) {
    const gt = new Date(values[i].gameDate);
    if (!earliest || gt < earliest) earliest = gt;
  }
  return earliest;
}

function getWaiverExpirationPST(): string {
  const now = new Date();
  const targetLA = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric", month: "2-digit", day: "2-digit",
  });
  const parts = formatter.formatToParts(targetLA);
  const get = (type: string) => parts.find(p => p.type === type)?.value || "0";
  const year = parseInt(get("year"));
  const month = parseInt(get("month")) - 1;
  const day = parseInt(get("day"));

  const guess = new Date(Date.UTC(year, month, day, 8, 0, 0, 0));
  const checkHour = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "2-digit", hour12: false,
  });
  const h = parseInt(checkHour.format(guess));
  if (h !== 0) {
    guess.setUTCHours(guess.getUTCHours() - h);
  }
  return guess.toISOString();
}

function getSessionUserId(req: any): number | null {
  const userId = req?.session?.userId;
  if (!userId) return null;
  const parsed = Number(userId);
  return Number.isFinite(parsed) ? parsed : null;
}

function getAdminUserIds(): Set<number> {
  const raw = (process.env.ADMIN_USER_IDS || "").trim();
  if (!raw) return new Set<number>();
  return new Set(
    raw
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n > 0),
  );
}

async function isLeagueMember(leagueId: number, userId: number): Promise<boolean> {
  const leagueTeams = await storage.getTeamsByLeagueId(leagueId);
  return leagueTeams.some((t) => t.userId === userId);
}

function parsePositiveInt(value: unknown): number | null {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  if (!Number.isInteger(num) || num <= 0) return null;
  return num;
}

function parseBoundedInt(value: unknown, defaultValue: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) return defaultValue;
  return Math.max(min, Math.min(max, parsed));
}

function sanitizeSearchQuery(value: unknown, maxLen = 80): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, maxLen);
}

function safeErrorResponse(res: Response, clientMessage: string, status = 500) {
  return res.status(status).json({ message: clientMessage });
}

async function generateLeagueMatchups(leagueId: number): Promise<void> {
  const league = await storage.getLeague(leagueId);
  if (!league) return;

  const format = league.scoringFormat || "Roto";
  if (!format.startsWith("H2H")) return;

  await storage.deleteMatchupsByLeague(leagueId);

  const leagueTeams = await storage.getTeamsByLeagueId(leagueId);
  const n = leagueTeams.length;
  if (n < 2) return;

  const teamIds = leagueTeams.map(t => t.id);
  const ids = [...teamIds];
  if (n % 2 !== 0) ids.push(-1);
  const numIds = ids.length;

  const rotationWeeks: [number, number][][] = [];
  for (let round = 0; round < numIds - 1; round++) {
    const pairs: [number, number][] = [];
    for (let i = 0; i < numIds / 2; i++) {
      const home = ids[i];
      const away = ids[numIds - 1 - i];
      if (home !== -1 && away !== -1) {
        pairs.push([home, away]);
      }
    }
    rotationWeeks.push(pairs);
    const last = ids.pop()!;
    ids.splice(1, 0, last);
  }

  const seasonWeeks = league.seasonWeeks || 27;
  const matchupsToInsert: InsertLeagueMatchup[] = [];

  for (let week = 1; week <= seasonWeeks; week++) {
    const rotIdx = (week - 1) % rotationWeeks.length;
    const pairs = rotationWeeks[rotIdx];
    for (const [teamA, teamB] of pairs) {
      matchupsToInsert.push({
        leagueId,
        week,
        teamAId: teamA,
        teamBId: teamB,
      });
    }
  }

  await storage.createMatchups(matchupsToInsert);
}

async function recalculateAdpForLeague(league: { type: string | null; scoringFormat: string | null; createdAt: Date | null }) {
  const leagueType = league.type || "Redraft";
  const scoringFormat = league.scoringFormat || "Roto";
  const season = league.createdAt ? new Date(league.createdAt).getFullYear() : 2026;
  await storage.recalculateAdp(leagueType, scoringFormat, season);
}

async function autoInitializeRosterSlots(leagueId: number): Promise<void> {
  try {
    const league = await storage.getLeague(leagueId);
    if (!league) return;

    const rosterPositions = league.rosterPositions || [];
    const leagueTeams = await storage.getTeamsByLeagueId(leagueId);
    const allPicks = await storage.getDraftPicksByLeague(leagueId);

    for (const team of leagueTeams) {
      const myPicks = allPicks.filter(p => p.teamId === team.id);
      const allInitialized = myPicks.length > 0 && myPicks.every(p => p.rosterSlot !== null);
      if (allInitialized) continue;

      const playerObjects: (Player | undefined)[] = await Promise.all(
        myPicks.map(p => storage.getPlayer(p.playerId))
      );

      const assigned = new Array<number | null>(rosterPositions.length).fill(null);
      const usedPickIndices = new Set<number>();

      for (let pass = 0; pass < 4; pass++) {
        for (let pi = 0; pi < myPicks.length; pi++) {
          if (usedPickIndices.has(pi)) continue;
          const player = playerObjects[pi];
          if (!player) continue;

          for (let si = 0; si < rosterPositions.length; si++) {
            if (assigned[si] !== null) continue;
            const slot = rosterPositions[si];

            if (pass === 0) {
              const isBBInit = league.type === "Best Ball";
              const isExactOrGroup = slot === player.position
                || (slot === "OF" && ["OF", "LF", "CF", "RF"].includes(player.position))
                || (isBBInit && slot === "OF" && ["DH", "UT"].includes(player.position))
                || (slot === "INF" && INF_POSITIONS.includes(player.position));
              if (isExactOrGroup) { assigned[si] = pi; usedPickIndices.add(pi); break; }
            } else if (pass === 1) {
              if ((slot === "UT" && !["SP", "RP"].includes(player.position)) || (slot === "P" && ["SP", "RP"].includes(player.position))) {
                assigned[si] = pi; usedPickIndices.add(pi); break;
              }
            } else if (pass === 2) {
              if (slot === "BN") { assigned[si] = pi; usedPickIndices.add(pi); break; }
            } else if (pass === 3) {
              if (slot === "IL") { assigned[si] = pi; usedPickIndices.add(pi); break; }
            }
          }
        }
      }

      for (let si = 0; si < rosterPositions.length; si++) {
        const pi = assigned[si];
        if (pi !== null) {
          await storage.setRosterSlot(myPicks[pi].id, si);
        }
      }

      if (league.type === "Best Ball") {
        let extraSlot = rosterPositions.length;
        for (let pi = 0; pi < myPicks.length; pi++) {
          if (!usedPickIndices.has(pi)) {
            await storage.setRosterSlot(myPicks[pi].id, extraSlot++);
          }
        }
      }
    }
  } catch (error) {
    console.error("Auto-init roster slots error:", error);
  }
}

const leagueDraftLocks = new Map<number, Promise<void>>();
function withLeagueDraftLock<T>(leagueId: number, fn: () => Promise<T>): Promise<T> {
  const prev = leagueDraftLocks.get(leagueId) || Promise.resolve();
  const next = prev.then(fn, fn);
  leagueDraftLocks.set(leagueId, next.then(() => {}, () => {}));
  return next;
}

export async function registerRoutes(app: Express): Promise<Server> {
  app.get("/api/news/:source", async (req, res) => {
    try {
      const source = String(req.params.source || "").toLowerCase();
      const sourceUrlMap: Record<string, string> = {
        rotowire: "https://www.rotowire.com/rss/news.php?sport=MLB",
        espn: "https://www.espn.com/espn/rss/mlb/news",
      };

      const url = sourceUrlMap[source];
      if (!url) {
        return res.status(400).json({ message: "Unknown news source" });
      }

      const response = await fetch(url, {
        headers: {
          "User-Agent": "LineupLabs/1.0 (+https://lineuplabs.app)",
          "Accept": "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
        },
      });

      if (!response.ok) {
        return res.status(502).json({ message: `Failed to fetch ${source} feed` });
      }

      const xml = await response.text();
      const items = parseRssItems(xml, 8);
      return res.json({ source, items });
    } catch (error) {
      console.error("News feed fetch error:", error);
      return safeErrorResponse(res, "Failed to load news feed");
    }
  });

  // Get public leagues
  app.get("/api/leagues/public", async (req, res) => {
    try {
      const leagues = await storage.getPublicLeagues();
      const leagueIds = leagues.map((league) => league.id);
      const teamCountMap = new Map<number, number>();

      if (leagueIds.length > 0) {
        const counts = await db
          .select({
            leagueId: teamsTable.leagueId,
            currentTeams: sql<number>`COUNT(*) FILTER (WHERE COALESCE(${teamsTable.isCpu}, FALSE) = FALSE)`,
          })
          .from(teamsTable)
          .where(inArray(teamsTable.leagueId, leagueIds))
          .groupBy(teamsTable.leagueId);

        for (const row of counts) {
          if (row.leagueId != null) {
            teamCountMap.set(Number(row.leagueId), Number(row.currentTeams || 0));
          }
        }
      }

      const leaguesWithTeamCount = leagues.map((league) => ({
        ...league,
        currentTeams: teamCountMap.get(league.id) ?? 0,
      }));
      res.json(leaguesWithTeamCount);
    } catch (error) {
      safeErrorResponse(res, "Failed to fetch public leagues");
    }
  });

  // Enforce league membership for league-scoped API access.
  app.use("/api/leagues/:id", async (req, res, next) => {
    try {
      const leagueId = parseInt(req.params.id);
      if (!leagueId || Number.isNaN(leagueId)) {
        return res.status(400).json({ message: "Invalid league id" });
      }

      const userId = getSessionUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const league = await storage.getLeague(leagueId);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }

      // Joining must remain available to authenticated non-members.
      if (req.method.toUpperCase() === "POST" && req.path === "/join") {
        return next();
      }

      const member = await isLeagueMember(leagueId, userId);
      if (!member) {
        return res.status(403).json({ message: "Forbidden" });
      }

      return next();
    } catch {
      return safeErrorResponse(res, "Failed to authorize league access");
    }
  });

  // Restrict league-team listings to league members only.
  app.use("/api/teams/league/:leagueId", async (req, res, next) => {
    try {
      const leagueId = parseInt(req.params.leagueId);
      if (!leagueId || Number.isNaN(leagueId)) {
        return res.status(400).json({ message: "Invalid league id" });
      }
      const userId = getSessionUserId(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });
      const member = await isLeagueMember(leagueId, userId);
      if (!member) return res.status(403).json({ message: "Forbidden" });
      return next();
    } catch {
      return safeErrorResponse(res, "Failed to authorize team access");
    }
  });

  // Get user teams
  app.get("/api/teams/user/:userId", async (req, res) => {
    try {
      const authUserId = getSessionUserId(req);
      const userId = parseInt(req.params.userId);
      if (!authUserId || authUserId !== userId) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const teams = await storage.getTeamsByUserId(userId);
      res.json(teams);
    } catch (error) {
      safeErrorResponse(res, "Failed to fetch user teams");
    }
  });

  // Get teams by league
  app.get("/api/teams/league/:leagueId", async (req, res) => {
    try {
      const leagueId = parseInt(req.params.leagueId);
      const teams = await storage.getTeamsByLeagueId(leagueId);
      const sorted = [...teams].sort((a, b) => (a.draftPosition || 999) - (b.draftPosition || 999));
      res.json(sorted);
    } catch (error) {
      safeErrorResponse(res, "Failed to fetch league teams");
    }
  });

  // Get user activities
  app.get("/api/activities/user/:userId", async (req, res) => {
    try {
      const authUserId = getSessionUserId(req);
      const userId = parseInt(req.params.userId);
      if (!authUserId || authUserId !== userId) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const activities = await storage.getActivitiesByUserId(userId);
      res.json(activities);
    } catch (error) {
      safeErrorResponse(res, "Failed to fetch user activities");
    }
  });

  // Update league settings (commissioner only)
  app.patch("/api/leagues/:id", async (req, res) => {
    try {
      const authUserId = getSessionUserId(req);
      const id = parseInt(req.params.id);
      const league = await storage.getLeague(id);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }
      const { ...updates } = req.body;
      const userId = authUserId;
      if (league.createdBy !== userId) {
        return res.status(403).json({ message: "Only the commissioner can update league settings" });
      }
      if (updates.draftDate && new Date(updates.draftDate) <= new Date()) {
        return res.status(400).json({ message: "Draft date must be in the future" });
      }
      if (updates.leagueImage !== undefined) {
        if (updates.leagueImage !== null) {
          if (typeof updates.leagueImage !== "string" || !updates.leagueImage.startsWith("data:image/")) {
            return res.status(400).json({ message: "leagueImage must be a data URL starting with data:image/" });
          }
          if (updates.leagueImage.length > 3 * 1024 * 1024) {
            return res.status(400).json({ message: "leagueImage is too large (max ~2MB)" });
          }
        }
      }

      const draftHasStarted = league.draftStatus === "active" || league.draftStatus === "paused" || league.draftStatus === "completed";

      if (draftHasStarted && updates.type !== undefined && updates.type !== league.type) {
        return res.status(400).json({ message: "League type cannot be changed after the draft has started" });
      }

      if (draftHasStarted && updates.scoringFormat !== undefined && updates.scoringFormat !== league.scoringFormat) {
        return res.status(400).json({ message: "Scoring format cannot be changed after the draft has started" });
      }

      if (draftHasStarted && updates.pointValues !== undefined && updates.pointValues !== league.pointValues) {
        return res.status(400).json({ message: "Point values cannot be changed after the draft has started" });
      }

      if (updates.maxTeams !== undefined) {
        const existingTeams = await storage.getTeamsByLeagueId(id);
        if (updates.maxTeams < existingTeams.length) {
          return res.status(400).json({ message: `Cannot reduce max teams below the current team count (${existingTeams.length})` });
        }
      }

      if (updates.pointValues !== undefined) {
        if (typeof updates.pointValues === "string") {
          try {
            const parsed = JSON.parse(updates.pointValues);
            if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
              return res.status(400).json({ message: "pointValues must be a JSON object of stat: number pairs" });
            }
            for (const [k, v] of Object.entries(parsed)) {
              if (typeof v !== "number") {
                return res.status(400).json({ message: `pointValues.${k} must be a number` });
              }
            }
          } catch {
            return res.status(400).json({ message: "pointValues must be valid JSON" });
          }
        } else if (updates.pointValues !== null) {
          return res.status(400).json({ message: "pointValues must be a JSON string or null" });
        }
      }
      const effectiveType = updates.type || league.type;
      const effectiveScoring = updates.scoringFormat || league.scoringFormat;
      if (effectiveType === "Best Ball" && effectiveScoring && !["Roto", "Season Points"].includes(effectiveScoring)) {
        return res.status(400).json({ message: "Best Ball leagues only support Roto and Season Points scoring formats" });
      }

      const updated = await storage.updateLeague(id, updates);
      broadcastDraftEvent(id, "league-settings", updates);
      res.json(updated);
    } catch (error) {
      safeErrorResponse(res, "Failed to update league");
    }
  });

  app.get("/api/leagues/:id/draft-events", (req, res) => {
    const leagueId = parseInt(req.params.id);
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.write(`data: ${JSON.stringify({ type: "connected", leagueId })}\n\n`);
    addClient(leagueId, res);
    const keepAlive = setInterval(() => {
      try { res.write(": keepalive\n\n"); } catch { clearInterval(keepAlive); }
    }, 30000);
    res.on("close", () => clearInterval(keepAlive));
  });

  // Commissioner draft control (start/pause/resume)
  app.post("/api/leagues/:id/draft-control", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const league = await storage.getLeague(id);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }
      const authUserId = getSessionUserId(req);
      const { action, fillWithCpu } = req.body;
      const userId = authUserId;
      if (league.createdBy !== userId) {
        return res.status(403).json({ message: "Only the commissioner can control the draft" });
      }
      if (!["start", "pause", "resume"].includes(action)) {
        return res.status(400).json({ message: "Invalid action" });
      }

      if (action === "start" && league.draftStatus === "completed") {
        return res.status(400).json({ message: "Cannot restart a completed draft" });
      }

      if (action === "start" && !fillWithCpu) {
        const existingTeams = await storage.getTeamsByLeagueId(id);
        const humanTeams = existingTeams.filter(t => !t.isCpu);
        const cpuTeams = existingTeams.filter(t => t.isCpu);
        if (cpuTeams.length > 0) {
          for (const cpu of cpuTeams) {
            await storage.deleteTeam(cpu.id);
          }
          await storage.updateLeague(id, { maxTeams: humanTeams.length, numberOfTeams: humanTeams.length } as any);
        }
      }

      if (action === "start") {
        const allTeams = await storage.getTeamsByLeagueId(id);
        const hasPositions = allTeams.some(t => t.draftPosition);
        if (!hasPositions) {
          const shuffled = [...allTeams].sort(() => Math.random() - 0.5);
          for (let i = 0; i < shuffled.length; i++) {
            await storage.updateTeam(shuffled[i].id, { draftPosition: i + 1 } as any);
          }
        } else {
          const maxSlots = league.maxTeams || league.numberOfTeams || 12;
          const usedPositions = new Set(allTeams.filter(t => t.draftPosition).map(t => t.draftPosition!));
          const availablePositions: number[] = [];
          for (let p = 1; p <= maxSlots; p++) {
            if (!usedPositions.has(p)) availablePositions.push(p);
          }
          let idx = 0;
          for (const t of allTeams) {
            if (!t.draftPosition && idx < availablePositions.length) {
              await storage.updateTeam(t.id, { draftPosition: availablePositions[idx++] } as any);
            }
          }
        }
      }

      const secondsPerPick = league.secondsPerPick || 60;
      const newStatus = action === "pause" ? "paused" : "active";
      const updateData: Record<string, unknown> = { draftStatus: newStatus };
      if (newStatus === "active") {
        if (action === "resume" && typeof league.draftPickStartedAt === "string" && league.draftPickStartedAt.startsWith("paused:")) {
          const remainingRaw = Number(league.draftPickStartedAt.slice("paused:".length));
          const remainingSeconds = Number.isFinite(remainingRaw)
            ? Math.max(0, Math.min(secondsPerPick, Math.floor(remainingRaw)))
            : secondsPerPick;
          const elapsedSeconds = Math.max(0, secondsPerPick - remainingSeconds);
          updateData.draftPickStartedAt = new Date(Date.now() - elapsedSeconds * 1000).toISOString();
        } else {
          updateData.draftPickStartedAt = new Date().toISOString();
        }
      } else {
        // Persist remaining time so resume does not reset the pick clock.
        const startedAtMs = league.draftPickStartedAt ? new Date(league.draftPickStartedAt).getTime() : NaN;
        if (Number.isFinite(startedAtMs)) {
          const elapsedSeconds = Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000));
          const remainingSeconds = Math.max(0, secondsPerPick - elapsedSeconds);
          updateData.draftPickStartedAt = `paused:${remainingSeconds}`;
        } else {
          updateData.draftPickStartedAt = `paused:${secondsPerPick}`;
        }
      }
      const updated = await storage.updateLeague(id, updateData);
      broadcastDraftEvent(id, "draft-status", { action, draftStatus: newStatus });
      broadcastDraftEvent(id, "teams-update");
      res.json(updated);
    } catch (error) {
      safeErrorResponse(res, "Failed to update draft status");
    }
  });

  app.post("/api/leagues/:id/randomize-draft-order", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const league = await storage.getLeague(id);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }
      const userId = getSessionUserId(req);
      if (league.createdBy !== userId) {
        return res.status(403).json({ message: "Only the commissioner can set draft order" });
      }
      const leagueTeams = await storage.getTeamsByLeagueId(id);
      const maxSlots = league.maxTeams || league.numberOfTeams || 12;
      const positions = Array.from({ length: maxSlots }, (_, i) => i + 1);
      for (let i = positions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [positions[i], positions[j]] = [positions[j], positions[i]];
      }
      for (let i = 0; i < leagueTeams.length; i++) {
        await storage.updateTeam(leagueTeams[i].id, { draftPosition: positions[i] } as any);
      }
      await storage.updateLeague(id, { draftOrder: "Random" });
      broadcastDraftEvent(id, "teams-update");
      const updatedTeams = await storage.getTeamsByLeagueId(id);
      res.json(updatedTeams.sort((a, b) => (a.draftPosition || 999) - (b.draftPosition || 999)));
    } catch (error) {
      safeErrorResponse(res, "Failed to randomize draft order");
    }
  });

  app.post("/api/leagues/:id/set-draft-order", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const league = await storage.getLeague(id);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }
      const userId = getSessionUserId(req);
      const { teamOrder } = req.body;
      if (league.createdBy !== userId) {
        return res.status(403).json({ message: "Only the commissioner can set draft order" });
      }
      if (!Array.isArray(teamOrder)) {
        return res.status(400).json({ message: "teamOrder must be an array of team IDs" });
      }
      const leagueTeams = await storage.getTeamsByLeagueId(id);
      const leagueTeamIds = new Set(leagueTeams.map(t => t.id));
      const uniqueOrder = new Set(teamOrder);
      if (uniqueOrder.size !== leagueTeams.length) {
        return res.status(400).json({ message: "teamOrder must include all league teams exactly once" });
      }
      for (const tid of teamOrder) {
        if (!leagueTeamIds.has(tid)) {
          return res.status(400).json({ message: `Team ID ${tid} does not belong to this league` });
        }
      }
      for (let i = 0; i < teamOrder.length; i++) {
        await storage.updateTeam(teamOrder[i], { draftPosition: i + 1 } as any);
      }
      await storage.updateLeague(id, { draftOrder: "Manual" });
      broadcastDraftEvent(id, "teams-update");
      const updatedTeams = await storage.getTeamsByLeagueId(id);
      res.json(updatedTeams.sort((a, b) => (a.draftPosition || 999) - (b.draftPosition || 999)));
    } catch (error) {
      safeErrorResponse(res, "Failed to set draft order");
    }
  });

  app.delete("/api/leagues/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const league = await storage.getLeague(id);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }
      const userId = getSessionUserId(req);
      if (!userId || Number.isNaN(userId)) {
        return res.status(400).json({ message: "Missing or invalid userId" });
      }
      if (league.createdBy !== userId) {
        return res.status(403).json({ message: "Only the commissioner can delete the league" });
      }
      await storage.deleteLeague(id);
      res.json({ message: "League deleted" });
    } catch (error) {
      console.error("[League Delete] failed:", error);
      safeErrorResponse(res, "Failed to delete league");
    }
  });

  // Get league by ID
  app.get("/api/leagues/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const league = await storage.getLeague(id);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }
      res.json(league);
    } catch (error) {
      safeErrorResponse(res, "Failed to fetch league");
    }
  });

  app.get("/api/leagues/:id/standings", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const league = await storage.getLeague(id);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }
      const teams = await storage.getTeamsByLeagueId(id);
      const draftPicks = await storage.getDraftPicksByLeague(id);
      const playerIdSet = new Set(draftPicks.map(dp => dp.playerId));
      const playerIds = Array.from(playerIdSet);
      const playerList = await storage.getPlayersByIds(playerIds);
      const playerMap = new Map(playerList.map(p => [p.id, p]));
      const rosterPositions = league.rosterPositions || ["C", "1B", "2B", "3B", "SS", "OF", "OF", "OF", "UT", "SP", "SP", "RP", "RP", "BN", "BN", "IL"];

      let result: {
        format: string;
        standings: Array<Record<string, any>>;
        hittingCategories: string[];
        pitchingCategories: string[];
        numTeams: number;
      };
      try {
        result = await computeStandings(league, teams, draftPicks, playerMap, rosterPositions) as any;
      } catch (standingsError) {
        console.error("[Standings] computeStandings failed, returning fallback standings:", standingsError);
        const fallbackStandings = [...teams]
          .sort((a, b) => (b.points ?? 0) - (a.points ?? 0) || (b.wins ?? 0) - (a.wins ?? 0))
          .map((team) => ({
            teamId: team.id,
            teamName: team.name,
            userId: team.userId,
            isCpu: team.isCpu,
            totalPoints: Number(team.points ?? 0),
            wins: Number(team.wins ?? 0),
            losses: Number(team.losses ?? 0),
            ties: 0,
            pointsFor: Number(team.points ?? 0),
            pointsAgainst: 0,
            categoryWins: Number(team.wins ?? 0),
            categoryLosses: Number(team.losses ?? 0),
            categoryTies: 0,
            categoryValues: {},
            categoryPoints: {},
          }));

        result = {
          format: league.scoringFormat || "Roto",
          standings: fallbackStandings,
          hittingCategories: league.hittingCategories || ["R", "HR", "RBI", "SB", "AVG"],
          pitchingCategories: league.pitchingCategories || ["W", "SV", "K", "ERA", "WHIP"],
          numTeams: teams.length,
        };
      }
      for (const team of result.standings) {
        if (team.userId && !team.isCpu) {
          const user = await storage.getUser(team.userId);
          if (user) {
            (team as any).userName = user.username;
          }
        }
      }
      res.json(result);
    } catch (error) {
      console.error("[Standings] route failed:", error);
      safeErrorResponse(res, "Failed to compute standings");
    }
  });

  app.get("/api/leagues/:id/matchups", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const league = await storage.getLeague(id);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }
      const format = league.scoringFormat || "Roto";
      if (!format.startsWith("H2H")) {
        return res.status(400).json({ message: "Matchups are only available for H2H leagues" });
      }
      const teams = await storage.getTeamsByLeagueId(id);
      const draftPicks = await storage.getDraftPicksByLeague(id);
      const playerIdSet = new Set(draftPicks.map(dp => dp.playerId));
      const playerList = await storage.getPlayersByIds(Array.from(playerIdSet));
      const playerMap = new Map(playerList.map(p => [p.id, p]));
      const rosterPositions = league.rosterPositions || ["C", "1B", "2B", "3B", "SS", "OF", "OF", "OF", "UT", "SP", "SP", "RP", "RP", "BN", "BN", "IL"];

      let dbMatchups = await storage.getMatchupsByLeague(id);
      if (dbMatchups.length === 0 && league.draftStatus === "completed") {
        await generateLeagueMatchups(id);
        dbMatchups = await storage.getMatchupsByLeague(id);
      }
      const persistedMatchups = dbMatchups.map(m => ({
        week: m.week,
        teamAId: m.teamAId,
        teamBId: m.teamBId,
      }));

      const matchups = computeMatchups(league, teams, draftPicks, playerMap, rosterPositions, persistedMatchups);
      res.json({ format, matchups });
    } catch (error) {
      safeErrorResponse(res, "Failed to compute matchups");
    }
  });

  // Get daily lineup for a team on a date
  app.get("/api/leagues/:id/daily-lineup", async (req, res) => {
    try {
      const leagueId = parseInt(req.params.id);
      const teamId = parseInt(req.query.teamId as string);
      const date = req.query.date as string;
      
      const lineup = await storage.getDailyLineup(leagueId, teamId, date);
      res.json(lineup);
    } catch (error) {
      safeErrorResponse(res, "Failed to fetch daily lineup");
    }
  });

  app.get("/api/leagues/:id/player-lock", async (req, res) => {
    try {
      const leagueId = parseInt(req.params.id);
      const league = await storage.getLeague(leagueId);
      if (!league) return res.status(404).json({ message: "League not found" });

      const playerId = parseInt(req.query.playerId as string);
      const date = req.query.date as string;

      const now = new Date();
      const todayStr = now.toISOString().split("T")[0];

      if (date < todayStr) {
        return res.json({ isLocked: true });
      }

      const lockType = league.lineupLockType || "Daily";

      if (lockType === "Weekly") {
        const dayOfWeek = now.getDay();
        if (dayOfWeek === 1) {
          const schedule = await getScheduleForDate(todayStr);
          const earliest = getEarliestGameTime(schedule);
          if (earliest && now >= earliest) {
            return res.json({ isLocked: true });
          }
        } else if (dayOfWeek > 1 || dayOfWeek === 0) {
          return res.json({ isLocked: true });
        }
        return res.json({ isLocked: false });
      }

      const player = await storage.getPlayer(playerId);
      if (!player) return res.json({ isLocked: false });

      const gameTimes = await getPlayerGameTimes([{ id: player.id, teamAbbreviation: player.teamAbbreviation }], date);
      const info = gameTimes[0];

      res.json({ isLocked: info?.isLocked || false });
    } catch (error) {
      safeErrorResponse(res, "Failed to check lock status");
    }
  });

  app.get("/api/leagues/:id/game-times", async (req, res) => {
    try {
      const leagueId = parseInt(req.params.id);
      const teamId = parseInt(req.query.teamId as string);
      const date = req.query.date as string;

      if (!teamId || !date) {
        return res.status(400).json({ message: "teamId and date are required" });
      }

      const league = await storage.getLeague(leagueId);
      const lockType = league?.lineupLockType || "Daily";

      let weeklyLocked = false;
      if (lockType === "Weekly") {
        const now = new Date();
        const todayStr = now.toISOString().split("T")[0];
        if (date < todayStr) {
          weeklyLocked = true;
        } else {
          const dayOfWeek = now.getDay();
          if (dayOfWeek === 1) {
            const schedule = await getScheduleForDate(todayStr);
            const earliest = getEarliestGameTime(schedule);
            if (earliest && now >= earliest) weeklyLocked = true;
          } else if (dayOfWeek > 1 || dayOfWeek === 0) {
            weeklyLocked = true;
          }
        }
      }

      const dailyLineup = await storage.getDailyLineup(leagueId, teamId, date);
      const lineupPlayerIds = dailyLineup
        .filter((d: any) => d.playerId != null)
        .map((d: any) => d.playerId);

      let playerIds = lineupPlayerIds;
      if (playerIds.length === 0) {
        const draftPicks = await storage.getDraftPicksByLeague(leagueId);
        const teamPicks = draftPicks.filter(dp => dp.teamId === teamId);
        playerIds = teamPicks.map(dp => dp.playerId);
      }

      const players = await storage.getPlayersByIds(playerIds);

      const gameTimes = await getPlayerGameTimes(
        players.map(p => ({ id: p.id, teamAbbreviation: p.teamAbbreviation })),
        date
      );

      if (weeklyLocked) {
        gameTimes.forEach(gt => { gt.isLocked = true; });
      }

      res.json(gameTimes);
    } catch (error) {
      safeErrorResponse(res, "Failed to fetch game times");
    }
  });

  app.post("/api/leagues/:id/daily-lineup/swap", async (req, res) => {
    try {
      const leagueId = parseInt(req.params.id);
      const { teamId, date, slotIndexA, slotIndexB } = req.body;

      const league = await storage.getLeague(leagueId);
      if (!league) return res.status(404).json({ message: "League not found" });
      if (league.type === "Best Ball") return res.status(400).json({ message: "Lineup management is disabled in Best Ball leagues" });

      const now = new Date();
      const todayStr = now.toISOString().split("T")[0];
      if (date < todayStr) {
        return res.status(400).json({ message: "Cannot edit past lineups" });
      }

      const lockType = league.lineupLockType || "Daily";
      if (lockType === "Weekly") {
        const dayOfWeek = now.getDay();
        let weeklyLocked = false;
        if (dayOfWeek === 1) {
          const schedule = await getScheduleForDate(todayStr);
          const earliest = getEarliestGameTime(schedule);
          if (earliest && now >= earliest) weeklyLocked = true;
        } else if (dayOfWeek > 1 || dayOfWeek === 0) {
          weeklyLocked = true;
        }
        if (weeklyLocked) {
          return res.status(400).json({ message: "Weekly lineups are locked until next Monday before game time." });
        }
      }

      const currentLineup = await storage.getDailyLineup(leagueId, teamId, date);
      const entryA = currentLineup.find(e => e.slotIndex === slotIndexA);
      const entryB = currentLineup.find(e => e.slotIndex === slotIndexB);

      if (lockType === "Daily") {
        const playerIdsToCheck: number[] = [];
        if (entryA?.playerId) playerIdsToCheck.push(entryA.playerId);
        if (entryB?.playerId) playerIdsToCheck.push(entryB.playerId);

        if (playerIdsToCheck.length > 0) {
          const players = await storage.getPlayersByIds(playerIdsToCheck);
          const gameTimes = await getPlayerGameTimes(
            players.map(p => ({ id: p.id, teamAbbreviation: p.teamAbbreviation })),
            date
          );
          const lockedPlayers = gameTimes.filter(gt => gt.isLocked);
          if (lockedPlayers.length > 0) {
            const lockedNames = players
              .filter(p => lockedPlayers.some(lp => lp.playerId === p.id))
              .map(p => p.name);
            return res.status(400).json({ message: `Cannot move locked player(s): ${lockedNames.join(", ")}. Their game has already started.` });
          }
        }
      }

      const newEntries = [];
      if (entryA) {
        newEntries.push({ ...entryA, slotIndex: slotIndexB });
      }
      if (entryB) {
        newEntries.push({ ...entryB, slotIndex: slotIndexA });
      }

      await storage.saveDailyLineup(newEntries);
      res.json({ message: "Lineup updated" });
    } catch (error) {
      safeErrorResponse(res, "Failed to swap lineup slots");
    }
  });

  // Search players
  app.get("/api/players", async (req, res) => {
    try {
      const query = sanitizeSearchQuery(req.query.q);
      const position = typeof req.query.position === "string" ? req.query.position : undefined;
      const mlbLevel = typeof req.query.level === "string" ? req.query.level : undefined;
      const limit = parseBoundedInt(req.query.limit, 50, 1, 200);
      const offset = parseBoundedInt(req.query.offset, 0, 0, 10000);
      const adpType = req.query.adpType as string | undefined;
      const adpScoring = req.query.adpScoring as string | undefined;
      const adpSeason = req.query.adpSeason ? parsePositiveInt(req.query.adpSeason) || undefined : undefined;
      const result = await storage.searchPlayers(query, position, mlbLevel, limit, offset, adpType, adpScoring, adpSeason);
      res.json(result);
    } catch (error) {
      safeErrorResponse(res, "Failed to search players");
    }
  });
  // Get player by ID
  app.post("/api/players/by-ids", async (req, res) => {
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.json([]);
      }
      if (ids.length > 500) {
        return res.status(400).json({ message: "ids exceeds max size (500)" });
      }
      const numericIds = ids.map((id: unknown) => parsePositiveInt(id)).filter((id: number | null): id is number => id !== null);
      if (numericIds.length !== ids.length) {
        return res.status(400).json({ message: "ids must contain only positive integers" });
      }
      const players = await storage.getPlayersByIds(numericIds);
      res.json(players);
    } catch (error) {
      safeErrorResponse(res, "Failed to fetch players");
    }
  });

  app.get("/api/players/:id", async (req, res) => {
    try {
      const id = parsePositiveInt(req.params.id);
      if (!id) return res.status(400).json({ message: "Invalid player id" });
      const player = await storage.getPlayer(id);
      if (!player) {
        return res.status(404).json({ message: "Player not found" });
      }
      res.json(player);
    } catch (error) {
      safeErrorResponse(res, "Failed to fetch player");
    }
  });

  app.get("/api/users/:id/profile-stats", async (req, res) => {
    try {
      const authUserId = getSessionUserId(req);
      const userId = parseInt(req.params.id);
      if (!authUserId || authUserId !== userId) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const userTeams = await storage.getTeamsByUserId(userId);
      const leagueIds = [...new Set(userTeams.map(t => t.leagueId).filter(Boolean))] as number[];
      const leagueMap = new Map<number, { status: string | null }>();
      for (const lid of leagueIds) {
        const league = await storage.getLeague(lid);
        if (league) leagueMap.set(lid, { status: league.status });
      }

      const allTimeLeagues = leagueIds.length;
      let gold = 0, silver = 0, bronze = 0;
      let completedLeagues = 0;

      for (const team of userTeams) {
        if (!team.leagueId || team.isCpu) continue;
        const league = leagueMap.get(team.leagueId);
        if (league?.status === "Completed") {
          completedLeagues++;
          if (team.rank === 1) gold++;
          else if (team.rank === 2) silver++;
          else if (team.rank === 3) bronze++;
        }
      }

      const winRate = completedLeagues > 0 ? (gold / completedLeagues) * 100 : 0;
      const trophyRate = completedLeagues > 0 ? ((gold + silver + bronze) / completedLeagues) * 100 : 0;

      let gmTier = "Intern";
      if (allTimeLeagues >= 50 && winRate >= 25) gmTier = "Hall of Fame";
      else if (allTimeLeagues >= 30 && winRate >= 20) gmTier = "Executive";
      else if (allTimeLeagues >= 20 && winRate >= 15) gmTier = "Director";
      else if (allTimeLeagues >= 10 && trophyRate >= 30) gmTier = "Manager";
      else if (allTimeLeagues >= 5) gmTier = "Scout";
      else if (allTimeLeagues >= 1) gmTier = "Rookie";

      res.json({ allTimeLeagues, completedLeagues, gold, silver, bronze, winRate, trophyRate, gmTier });
    } catch (error) {
      safeErrorResponse(res, "Failed to fetch profile stats");
    }
  });

  app.get("/api/users/:id/exposure", async (req, res) => {
    try {
      const authUserId = getSessionUserId(req);
      const userId = parseInt(req.params.id);
      if (!authUserId || authUserId !== userId) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const userTeams = await storage.getTeamsByUserId(userId);
      const teamIds = new Set(userTeams.filter(t => !t.isCpu).map(t => t.id));
      const leagueIds = [...new Set(userTeams.filter(t => !t.isCpu && t.leagueId).map(t => t.leagueId!))] as number[];

      if (leagueIds.length === 0) {
        return res.json({ totalLeagues: 0, players: [] });
      }

      const completedLeagueIds: number[] = [];
      for (const lid of leagueIds) {
        const league = await storage.getLeague(lid);
        if (league && league.draftStatus === "completed") {
          completedLeagueIds.push(lid);
        }
      }

      if (completedLeagueIds.length === 0) {
        return res.json({ totalLeagues: 0, players: [] });
      }

      const totalLeagues = completedLeagueIds.length;
      const playerLeagueMap = new Map<number, Set<number>>();

      for (const lid of completedLeagueIds) {
        const picks = await storage.getDraftPicksByLeague(lid);
        for (const pick of picks) {
          if (!teamIds.has(pick.teamId)) continue;
          if (!playerLeagueMap.has(pick.playerId)) {
            playerLeagueMap.set(pick.playerId, new Set());
          }
          playerLeagueMap.get(pick.playerId)!.add(lid);
        }
      }

      const playerIds = [...playerLeagueMap.keys()];
      const playerDataMap = new Map<number, Player>();
      for (const pid of playerIds) {
        const player = await storage.getPlayer(pid);
        if (player) playerDataMap.set(pid, player);
      }

      const exposureList = playerIds
        .map(pid => {
          const leagueCount = playerLeagueMap.get(pid)!.size;
          const player = playerDataMap.get(pid);
          if (!player) return null;
          return {
            playerId: pid,
            name: player.name,
            position: player.position,
            team: player.teamAbbreviation || player.team,
            leagueCount,
            totalLeagues,
            percentage: (leagueCount / totalLeagues) * 100,
          };
        })
        .filter(Boolean)
        .sort((a, b) => b!.percentage - a!.percentage || a!.name.localeCompare(b!.name));

      res.json({ totalLeagues, players: exposureList });
    } catch (error) {
      safeErrorResponse(res, "Failed to fetch exposure data");
    }
  });

  // Get user profile
  app.get("/api/users/:id", async (req, res) => {
    try {
      const authUserId = getSessionUserId(req);
      const id = parseInt(req.params.id);
      if (!authUserId || authUserId !== id) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const user = await storage.getUser(id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      res.json(stripBotFlag(user));
    } catch (error) {
      safeErrorResponse(res, "Failed to fetch user");
    }
  });

  app.patch("/api/users/:id", async (req, res) => {
    try {
      const authUserId = getSessionUserId(req);
      const id = parseInt(req.params.id);
      if (!authUserId || authUserId !== id) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const { username, avatar } = req.body;
      if (username !== undefined) {
        const existing = await storage.getUserByUsername(username);
        if (existing && existing.id !== id) {
          return res.status(400).json({ message: "Username already taken" });
        }
      }
      const updated = await storage.updateUserProfile(id, { username, avatar });
      if (!updated) return res.status(404).json({ message: "User not found" });
      res.json(stripBotFlag(updated));
    } catch (error) {
      safeErrorResponse(res, "Failed to update profile");
    }
  });

  app.delete("/api/users/:id", async (req, res) => {
    try {
      const authUserId = getSessionUserId(req);
      const id = parseInt(req.params.id);
      if (!authUserId || authUserId !== id) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const user = await storage.getUser(id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      await storage.deleteUser(id);
      if (req.session) {
        req.session.destroy(() => {});
      }
      res.json({ message: "Account deleted" });
    } catch (error) {
      safeErrorResponse(res, "Failed to delete account");
    }
  });

  // Create user (signup)
  app.post("/api/users", async (req, res) => {
    try {
      const body = { ...req.body };
      if (body.username) body.username = body.username.trim();
      if (body.email) body.email = body.email.trim().toLowerCase();
      if (body.avatar === "") body.avatar = null;
      const validatedData = insertUserSchema.parse(body);
      const existingUser = await storage.getUserByUsername(validatedData.username);
      if (existingUser) {
        return res.status(400).json({ message: "Username already exists" });
      }
      const existingEmail = await storage.getUserByEmail(validatedData.email);
      if (existingEmail) {
        return res.status(400).json({ message: "Email already exists" });
      }
      const hashedPassword = await hash(validatedData.password, 12);
      const user = await storage.createUser({
        ...validatedData,
        password: hashedPassword,
      });
      if (!user) {
        console.error("Signup: createUser returned no user");
        return safeErrorResponse(res, "Account could not be created. Please try again.");
      }
      if (req.session) {
        req.session.userId = user.id;
      }
      res.status(201).json(stripBotFlag(user));
    } catch (error: any) {
      console.error("Signup error:", error?.message || error);
      if (error?.stack) console.error(error.stack);
      if (error?.issues) {
        const invalidFields = Array.from(
          new Set(
            error.issues
              .map((i: any) => String(i?.path?.[0] ?? "").trim())
              .filter((f: string) => f.length > 0)
          )
        );
        return res.status(400).json({
          message: invalidFields.length
            ? `Invalid input for: ${invalidFields.join(", ")}`
            : "Invalid user data",
        });
      }
      const isValidation = error?.name === "ZodError";
      if (isValidation) return res.status(400).json({ message: "Invalid user data" });
      safeErrorResponse(res, "Server error during signup. Please try again.");
    }
  });

  // Login user
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      const trimmedUsername = (username || "").trim();
      const trimmedPassword = (password || "").trim();
      const user = await storage.getUserByUsername(trimmedUsername);
      let validPassword = false;
      if (user) {
        if (user.password.startsWith("$2a$") || user.password.startsWith("$2b$") || user.password.startsWith("$2y$")) {
          validPassword = await compare(trimmedPassword, user.password);
        } else {
          // Backward compatibility for legacy plaintext rows; upgrade hash on successful login.
          validPassword = user.password === trimmedPassword;
          if (validPassword) {
            const upgradedHash = await hash(trimmedPassword, 12);
            await storage.updateUserPassword(user.id, upgradedHash);
          }
        }
      }
      if (!user || !validPassword) {
        return res.status(401).json({ message: "Invalid username or password" });
      }
      if (req.session) {
        req.session.userId = user.id;
      }
      res.json(stripBotFlag(user));
    } catch (error: any) {
      console.error("Login error:", error?.message || error);
      safeErrorResponse(res, "Login failed");
    }
  });

  // Reset password
  app.post("/api/auth/reset-password", async (req, res) => {
    try {
      const { email, newPassword } = req.body;
      if (!email || !newPassword) {
        return res.status(400).json({ message: "Email and new password are required" });
      }
      if (newPassword.length < 6) {
        return res.status(400).json({ message: "Password must be at least 6 characters" });
      }
      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.status(404).json({ message: "No account found with that email" });
      }
      const hashedPassword = await hash(newPassword, 12);
      const updated = await storage.updateUserPassword(user.id, hashedPassword);
      if (!updated) {
        return safeErrorResponse(res, "Failed to update password");
      }
      res.json({ message: "Password updated successfully" });
    } catch (error) {
      safeErrorResponse(res, "Failed to reset password");
    }
  });

  app.get("/api/auth/me", async (req, res) => {
    try {
      const authUserId = getSessionUserId(req);
      if (!authUserId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const user = await storage.getUser(authUserId);
      if (!user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      return res.json(stripBotFlag(user));
    } catch {
      return safeErrorResponse(res, "Failed to fetch session user");
    }
  });

  app.post("/api/auth/logout", async (req, res) => {
    req.session?.destroy(() => {
      res.clearCookie("lineuplabs.sid");
      res.json({ ok: true });
    });
  });

  // Create league
  app.post("/api/leagues", async (req, res) => {
    try {
      const authUserId = getSessionUserId(req);
      const validatedData = insertLeagueSchema.parse({
        ...req.body,
        createdBy: authUserId,
      });
      if (!validatedData.draftDate || !String(validatedData.draftDate).includes("T")) {
        return res.status(400).json({ message: "Draft date and time are required" });
      }
      if (new Date(validatedData.draftDate) <= new Date()) {
        return res.status(400).json({ message: "Draft date and time must be in the future" });
      }
      if (validatedData.type === "Best Ball" && validatedData.scoringFormat && !["Roto", "Season Points"].includes(validatedData.scoringFormat)) {
        return res.status(400).json({ message: "Best Ball leagues only support Roto and Season Points scoring formats" });
      }
      if (validatedData.type === "Best Ball") {
        if (!validatedData.rosterPositions) {
          validatedData.rosterPositions = ["C", "INF", "INF", "INF", "INF", "OF", "OF", "OF", "SP", "SP", "SP", "RP", "RP"];
        }
        if (!validatedData.maxRosterSize) {
          validatedData.maxRosterSize = 35;
        }
      }
      const league = await storage.createLeague(validatedData);

      const targetTeams = league.maxTeams || league.numberOfTeams || 12;
      let nextPosition = 1;

      if (validatedData.createdBy) {
        const user = await storage.getUser(validatedData.createdBy);
        const teamName = user ? `${user.username}'s Team` : "My Team";
        const commTeam = await storage.createTeam({
          name: teamName,
          leagueId: league.id,
          userId: validatedData.createdBy,
          logo: "",
          nextOpponent: "",
        });
        await storage.updateTeam(commTeam.id, { draftPosition: nextPosition } as any);
        nextPosition++;
      }

      for (let i = nextPosition; i <= targetTeams; i++) {
        const cpuTeam = await storage.createTeam({
          name: `CPU Team ${i}`,
          leagueId: league.id,
          userId: null,
          logo: null,
          nextOpponent: null,
          isCpu: true,
        });
        await storage.updateTeam(cpuTeam.id, { draftPosition: i } as any);
      }

      res.status(201).json(league);
    } catch (error) {
      res.status(400).json({ message: "Invalid league data" });
    }
  });

  // Create team
  app.post("/api/teams", async (req, res) => {
    try {
      const authUserId = getSessionUserId(req);
      const validatedData = insertTeamSchema.parse({ ...req.body, userId: authUserId });
      const team = await storage.createTeam(validatedData);
      if (team.leagueId) {
        broadcastDraftEvent(team.leagueId, "teams-update");
      }
      res.status(201).json(team);
    } catch (error) {
      res.status(400).json({ message: "Invalid team data" });
    }
  });

  app.patch("/api/teams/:id/name", async (req, res) => {
    try {
      const teamId = parseInt(req.params.id, 10);
      const userId = getSessionUserId(req);
      const { name } = req.body as { name?: string };
      if (!teamId || !userId || typeof name !== "string") {
        return res.status(400).json({ message: "teamId, userId, and name are required" });
      }

      const trimmedName = name.trim();
      if (!trimmedName) {
        return res.status(400).json({ message: "Team name cannot be empty" });
      }
      if (trimmedName.length > 32) {
        return res.status(400).json({ message: "Team name must be 32 characters or fewer" });
      }

      const existingTeam = await storage.getTeam(teamId);
      if (!existingTeam) {
        return res.status(404).json({ message: "Team not found" });
      }
      if (existingTeam.isCpu) {
        return res.status(400).json({ message: "CPU teams cannot be renamed" });
      }
      if (existingTeam.userId !== userId) {
        return res.status(403).json({ message: "You can only rename your own team" });
      }

      const updated = await storage.updateTeam(teamId, { name: trimmedName } as any);
      if (!updated) {
        return safeErrorResponse(res, "Failed to update team name");
      }
      if (updated.leagueId) {
        broadcastDraftEvent(updated.leagueId, "teams-update");
      }

      res.json(updated);
    } catch (error) {
      safeErrorResponse(res, "Failed to update team name");
    }
  });

  app.post("/api/leagues/:id/join", async (req, res) => {
    try {
      const leagueId = parseInt(req.params.id);
      const userId = getSessionUserId(req);
      const { invite } = req.body;
      if (!userId) {
        return res.status(400).json({ message: "User ID is required" });
      }
      const league = await storage.getLeague(leagueId);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }
      if (!league.isPublic && !invite) {
        return res.status(403).json({ message: "This league is private" });
      }
      if (["active", "paused", "completed"].includes(league.draftStatus || "")) {
        return res.status(400).json({ message: "Cannot join a league after the draft has started" });
      }
      const existingTeams = await storage.getTeamsByLeagueId(leagueId);
      if (existingTeams.some(t => t.userId === userId)) {
        return res.status(400).json({ message: "You are already in this league" });
      }
      const humanTeams = existingTeams.filter(t => !t.isCpu);
      if (humanTeams.length >= (league.maxTeams || 12)) {
        return res.status(400).json({ message: "This league is full" });
      }
      const user = await storage.getUser(userId);
      const teamName = user ? `${user.username}'s Team` : "My Team";

      const cpuTeams = existingTeams
        .filter(t => t.isCpu)
        .sort((a, b) => (b.draftPosition || 999) - (a.draftPosition || 999));
      const replacedCpu = cpuTeams[0];
      const inheritedPosition = replacedCpu?.draftPosition || null;

      if (replacedCpu) {
        await storage.deleteTeam(replacedCpu.id);
      }

      const team = await storage.createTeam({
        name: teamName,
        leagueId,
        userId,
        logo: "",
        nextOpponent: "",
      });

      if (inheritedPosition) {
        await storage.updateTeam(team.id, { draftPosition: inheritedPosition } as any);
      }

      broadcastDraftEvent(leagueId, "teams-update");
      res.status(201).json(team);
    } catch (error) {
      safeErrorResponse(res, "Failed to join league");
    }
  });

  app.post("/api/leagues/:id/leave", async (req, res) => {
    try {
      const leagueId = parseInt(req.params.id);
      const userId = getSessionUserId(req);
      if (!userId) {
        return res.status(400).json({ message: "User ID is required" });
      }
      const league = await storage.getLeague(leagueId);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }
      if (["active", "paused", "completed"].includes(league.draftStatus || "")) {
        return res.status(400).json({ message: "Cannot leave a league after the draft has started" });
      }
      const leagueTeams = await storage.getTeamsByLeagueId(leagueId);
      const userTeam = leagueTeams.find(t => t.userId === userId);
      if (!userTeam) {
        return res.status(400).json({ message: "You are not in this league" });
      }
      if (league.createdBy === userId) {
        return res.status(400).json({ message: "The commissioner cannot leave the league. Transfer ownership or delete the league instead." });
      }
      await storage.deleteTeam(userTeam.id);
      broadcastDraftEvent(leagueId, "teams-update");
      res.json({ message: "Successfully left the league" });
    } catch (error) {
      safeErrorResponse(res, "Failed to leave league");
    }
  });

  app.post("/api/leagues/:id/kick", async (req, res) => {
    try {
      const leagueId = parseInt(req.params.id);
      const commissionerId = getSessionUserId(req);
      const { teamId } = req.body;
      if (!commissionerId || !teamId) {
        return res.status(400).json({ message: "commissionerId and teamId are required" });
      }
      const league = await storage.getLeague(leagueId);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }
      if (league.createdBy !== commissionerId) {
        return res.status(403).json({ message: "Only the commissioner can remove users" });
      }
      if (["active", "paused", "completed"].includes(league.draftStatus || "")) {
        return res.status(400).json({ message: "Cannot remove users after the draft has started" });
      }
      const team = await storage.getTeam(teamId);
      if (!team || team.leagueId !== leagueId) {
        return res.status(404).json({ message: "Team not found in this league" });
      }
      if (team.userId === commissionerId) {
        return res.status(400).json({ message: "You cannot remove yourself from the league" });
      }
      await storage.deleteTeam(teamId);
      broadcastDraftEvent(leagueId, "teams-update");
      res.json({ message: "User removed from the league" });
    } catch (error) {
      safeErrorResponse(res, "Failed to remove user");
    }
  });

  // Get draft picks for a league
  app.get("/api/leagues/:id/draft-picks", async (req, res) => {
    try {
      const leagueId = parseInt(req.params.id);
      const picks = await storage.getDraftPicksByLeague(leagueId);
      res.json(picks);
    } catch (error) {
      safeErrorResponse(res, "Failed to fetch draft picks");
    }
  });

  // Get who currently rosters a specific player in this league.
  app.get("/api/leagues/:id/player-holder/:playerId", async (req, res) => {
    try {
      const leagueId = parsePositiveInt(req.params.id);
      const playerId = parsePositiveInt(req.params.playerId);
      if (!leagueId || !playerId) {
        return res.status(400).json({ message: "Invalid league id or player id" });
      }

      const picks = await storage.getDraftPicksByLeague(leagueId);
      const pick = picks.find((p) => p.playerId === playerId);
      if (!pick) {
        return res.status(404).json({ message: "Player not rostered in this league" });
      }

      const team = await storage.getTeam(pick.teamId);
      if (!team) {
        return res.status(404).json({ message: "Team not found" });
      }

      let userName: string | null = null;
      if (team.userId) {
        const owner = await storage.getUser(team.userId);
        userName = owner?.username || null;
      }

      return res.json({
        teamId: team.id,
        teamName: team.name,
        userId: team.userId,
        userName,
        isCpu: !!team.isCpu,
      });
    } catch {
      return safeErrorResponse(res, "Failed to fetch player holder");
    }
  });

  // Make a draft pick
  app.post("/api/leagues/:id/draft-picks", async (req, res) => {
    const leagueId = parseInt(req.params.id);
    try {
      const result = await withLeagueDraftLock(leagueId, async () => {
        const league = await storage.getLeague(leagueId);
        if (!league) return { status: 404, body: { message: "League not found" } };
        if (league.draftStatus !== "active") return { status: 400, body: { message: "Draft is not active" } };

        const userId = getSessionUserId(req);
        const { playerId } = req.body;
        if (!userId || !playerId) return { status: 400, body: { message: "userId and playerId are required" } };

        const rawLeagueTeams = await storage.getTeamsByLeagueId(leagueId);
        const leagueTeams = [...rawLeagueTeams].sort((a, b) => (a.draftPosition || 999) - (b.draftPosition || 999));
        const userTeam = leagueTeams.find(t => t.userId === userId);
        if (!userTeam) return { status: 403, body: { message: "You don't have a team in this league" } };

        const existingPicks = await storage.getDraftPicksByLeague(leagueId);
        const totalRounds = getDraftRounds(league);
        const numTeams = leagueTeams.length;

        const nextOverall = existingPicks.length + 1;
        if (nextOverall > totalRounds * numTeams) return { status: 400, body: { message: "Draft is complete" } };

        const round = Math.ceil(nextOverall / numTeams);
        const pickInRound = ((nextOverall - 1) % numTeams) + 1;
        const isEvenRound = round % 2 === 1;
        const teamIndex = isEvenRound ? pickInRound - 1 : numTeams - pickInRound;
        const expectedTeam = leagueTeams[teamIndex];

        if (!expectedTeam || expectedTeam.id !== userTeam.id) return { status: 403, body: { message: "It's not your turn to pick" } };

        const alreadyDrafted = existingPicks.some(p => p.playerId === playerId);
        if (alreadyDrafted) return { status: 400, body: { message: "Player already drafted" } };

        const player = await storage.getPlayer(playerId);
        if (!player) return { status: 404, body: { message: "Player not found" } };

        const rosterPositions = league.rosterPositions || [];
        const teamPicks = existingPicks.filter(p => p.teamId === userTeam.id);
        const teamPlayers: { position: string }[] = [];
        for (const tp of teamPicks) {
          const pl = await storage.getPlayer(tp.playerId);
          if (pl) teamPlayers.push({ position: pl.position });
        }

        const isBestBallManual = league.type === "Best Ball";
        const maxRosterManual = getDraftRounds(league);

        if (teamPicks.length >= maxRosterManual) return { status: 400, body: { message: "Your roster is full" } };

        if (!isBestBallManual) {
          const filledSlots = new Set<number>();
          for (const tp of teamPlayers) {
            const idx = rosterPositions.findIndex((slot, i) => {
              if (filledSlots.has(i)) return false;
              return canFitSlot(tp.position, slot, false) && slot !== "BN" && slot !== "IL" && slot !== "UT" && slot !== "P";
            });
            if (idx !== -1) filledSlots.add(idx);
            else {
              if (!["SP", "RP"].includes(tp.position)) {
                const utilIdx = rosterPositions.findIndex((s, i) => !filledSlots.has(i) && s === "UT");
                if (utilIdx !== -1) filledSlots.add(utilIdx);
                else {
                  const bnIdx = rosterPositions.findIndex((s, i) => !filledSlots.has(i) && s === "BN");
                  if (bnIdx !== -1) filledSlots.add(bnIdx);
                }
              } else {
                const pIdx = rosterPositions.findIndex((s, i) => !filledSlots.has(i) && s === "P");
                if (pIdx !== -1) filledSlots.add(pIdx);
                else {
                  const bnIdx = rosterPositions.findIndex((s, i) => !filledSlots.has(i) && s === "BN");
                  if (bnIdx !== -1) filledSlots.add(bnIdx);
                }
              }
            }
          }

          const canFitPlayer = (playerPos: string): boolean => {
            for (let i = 0; i < rosterPositions.length; i++) {
              if (filledSlots.has(i)) continue;
              if (canFitSlot(playerPos, rosterPositions[i], false)) return true;
            }
            return false;
          };

          if (!canFitPlayer(player.position)) {
            return { status: 400, body: { message: `No open roster slot for ${player.position}. You can only draft players at positions you have unfilled.` } };
          }
        }

        const pick = await storage.createDraftPick({
          leagueId,
          teamId: userTeam.id,
          playerId,
          overallPick: nextOverall,
          round,
          pickInRound,
        });

        const totalPicks = totalRounds * numTeams;
        if (nextOverall >= totalPicks) {
          await storage.updateLeague(leagueId, { draftStatus: "completed", draftPickStartedAt: null });
          broadcastDraftEvent(leagueId, "draft-status", { draftStatus: "completed" });
          recalculateAdpForLeague(league).catch(e => console.error("ADP recalc error:", e));
          generateLeagueMatchups(leagueId).catch(e => console.error("Matchup gen error:", e));
          autoInitializeRosterSlots(leagueId).catch(e => console.error("Roster init error:", e));
        } else {
          await storage.updateLeague(leagueId, { draftPickStartedAt: new Date().toISOString() });
        }

        broadcastDraftEvent(leagueId, "pick", { overallPick: nextOverall, playerId, teamId: userTeam.id });
        return { status: 201, body: pick };
      });
      res.status(result.status).json(result.body);
    } catch (error) {
      console.error("Draft pick error:", error);
      safeErrorResponse(res, "Failed to make draft pick");
    }
  });

  // Commissioner assign: commissioner picks a player for the current pick
  app.post("/api/leagues/:id/commissioner-pick", async (req, res) => {
    const leagueId = parseInt(req.params.id);
    try {
      const result = await withLeagueDraftLock(leagueId, async () => {
        const league = await storage.getLeague(leagueId);
        if (!league) return { status: 404, body: { message: "League not found" } };
        if (league.draftStatus !== "active" && league.draftStatus !== "paused") {
          return { status: 400, body: { message: "Draft is not active or paused" } };
        }

        const commissionerId = getSessionUserId(req);
        const { playerId, targetOverall } = req.body;
        if (!commissionerId || !playerId) return { status: 400, body: { message: "commissionerId and playerId are required" } };
        if (league.createdBy !== commissionerId) return { status: 403, body: { message: "Only the commissioner can assign players" } };

        const rawLeagueTeams = await storage.getTeamsByLeagueId(leagueId);
        const leagueTeams = [...rawLeagueTeams].sort((a, b) => (a.draftPosition || 999) - (b.draftPosition || 999));
        const existingPicks = await storage.getDraftPicksByLeague(leagueId);
        const totalRounds = getDraftRounds(league);
        const numTeams = leagueTeams.length;

        const existingPickForSlot = targetOverall ? existingPicks.find(p => p.overallPick === targetOverall) : null;

        if (existingPickForSlot) {
          const alreadyDrafted = existingPicks.some(p => p.playerId === playerId && p.overallPick !== targetOverall);
          if (alreadyDrafted) return { status: 400, body: { message: "Player already drafted in another slot" } };

          const pick = await storage.updateDraftPickPlayer(leagueId, targetOverall, playerId);
          broadcastDraftEvent(leagueId, "pick", { overallPick: targetOverall, playerId, reassign: true });
          return { status: 200, body: pick };
        }

        const nextOverall = existingPicks.length + 1;
        if (nextOverall > totalRounds * numTeams) return { status: 400, body: { message: "Draft is complete" } };

        const round = Math.ceil(nextOverall / numTeams);
        const pickInRound = ((nextOverall - 1) % numTeams) + 1;
        const isEvenRound = round % 2 === 1;
        const teamIndex = isEvenRound ? pickInRound - 1 : numTeams - pickInRound;
        const expectedTeam = leagueTeams[teamIndex];

        if (!expectedTeam) return { status: 400, body: { message: "Cannot determine team for this pick" } };

        const alreadyDrafted = existingPicks.some(p => p.playerId === playerId);
        if (alreadyDrafted) return { status: 400, body: { message: "Player already drafted" } };

        const pick = await storage.createDraftPick({
          leagueId,
          teamId: expectedTeam.id,
          playerId,
          overallPick: nextOverall,
          round,
          pickInRound,
        });

        const totalPicks = totalRounds * numTeams;
        if (nextOverall >= totalPicks) {
          await storage.updateLeague(leagueId, { draftStatus: "completed", draftPickStartedAt: null });
          broadcastDraftEvent(leagueId, "draft-status", { draftStatus: "completed" });
          recalculateAdpForLeague(league).catch(e => console.error("ADP recalc error:", e));
          generateLeagueMatchups(leagueId).catch(e => console.error("Matchup gen error:", e));
          autoInitializeRosterSlots(leagueId).catch(e => console.error("Roster init error:", e));
        } else {
          await storage.updateLeague(leagueId, { draftPickStartedAt: new Date().toISOString() });
        }

        broadcastDraftEvent(leagueId, "pick", { overallPick: nextOverall, playerId, teamId: expectedTeam.id });
        return { status: 201, body: pick };
      });
      res.status(result.status).json(result.body);
    } catch (error) {
      console.error("Commissioner pick error:", error);
      safeErrorResponse(res, "Failed to make commissioner pick");
    }
  });

  // Auto-pick: system selects best available player for the team on the clock
  app.post("/api/leagues/:id/auto-pick", async (req, res) => {
    try {
      const leagueId = parseInt(req.params.id);
      const league = await storage.getLeague(leagueId);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }
      if (league.draftStatus !== "active") {
        return res.status(400).json({ message: "Draft is not active" });
      }

      const rawLeagueTeams = await storage.getTeamsByLeagueId(leagueId);
      const leagueTeams = [...rawLeagueTeams].sort((a, b) => (a.draftPosition || 999) - (b.draftPosition || 999));
      const existingPicks = await storage.getDraftPicksByLeague(leagueId);
      const rosterPositions = league.rosterPositions || [];
      const totalRounds = getDraftRounds(league);
      const numTeams = leagueTeams.length;

      const nextOverall = existingPicks.length + 1;
      if (nextOverall > totalRounds * numTeams) {
        return res.status(400).json({ message: "Draft is complete" });
      }

      const round = Math.ceil(nextOverall / numTeams);
      const pickInRound = ((nextOverall - 1) % numTeams) + 1;
      const isEvenRound = round % 2 === 1;
      const teamIndex = isEvenRound ? pickInRound - 1 : numTeams - pickInRound;
      const pickingTeam = leagueTeams[teamIndex];

      if (!pickingTeam) {
        return res.status(400).json({ message: "Could not determine picking team" });
      }

      const draftedPlayerIds = await storage.getDraftedPlayerIds(leagueId);
      const teamPicks = existingPicks.filter(p => p.teamId === pickingTeam.id);
      const teamPlayerIds = teamPicks.map(p => p.playerId);

      const teamPlayers: { position: string }[] = [];
      for (const pid of teamPlayerIds) {
        const pl = await storage.getPlayer(pid);
        if (pl) teamPlayers.push({ position: pl.position });
      }

      const isBestBall = league.type === "Best Ball";
      const maxRoster = getDraftRounds(league);

      const eligiblePositions: string[] = [];

      if (isBestBall) {
        for (const p of ["C", "1B", "2B", "3B", "SS", "OF", "SP", "RP", "DH"]) {
          eligiblePositions.push(p);
        }
      } else {
        const filledSlots = new Set<number>();
        for (const tp of teamPlayers) {
          const idx = rosterPositions.findIndex((slot, i) => {
            if (filledSlots.has(i)) return false;
            if (slot === tp.position) return true;
            if (slot === "OF" && ["OF", "LF", "CF", "RF"].includes(tp.position)) return true;
            if (slot === "INF" && INF_POSITIONS.includes(tp.position)) return true;
            return false;
          });
          if (idx !== -1) filledSlots.add(idx);
          else {
            if (!["SP", "RP"].includes(tp.position)) {
              const utilIdx = rosterPositions.findIndex((s, i) => !filledSlots.has(i) && s === "UT");
              if (utilIdx !== -1) filledSlots.add(utilIdx);
              else {
                const bnIdx = rosterPositions.findIndex((s, i) => !filledSlots.has(i) && s === "BN");
                if (bnIdx !== -1) filledSlots.add(bnIdx);
              }
            } else {
              const pIdx = rosterPositions.findIndex((s, i) => !filledSlots.has(i) && s === "P");
              if (pIdx !== -1) filledSlots.add(pIdx);
              else {
                const bnIdx = rosterPositions.findIndex((s, i) => !filledSlots.has(i) && s === "BN");
                if (bnIdx !== -1) filledSlots.add(bnIdx);
              }
            }
          }
        }

        const emptySlotPositions: string[] = [];
        for (let i = 0; i < rosterPositions.length; i++) {
          if (!filledSlots.has(i)) {
            emptySlotPositions.push(rosterPositions[i]);
          }
        }

        const hasBenchOrIL = emptySlotPositions.some(s => s === "BN" || s === "IL");
        const hasUtil = emptySlotPositions.some(s => s === "UT");
        const hasP = emptySlotPositions.some(s => s === "P");
        const hasInf = emptySlotPositions.some(s => s === "INF");

        for (const slot of emptySlotPositions) {
          if (slot === "BN" || slot === "IL") continue;
          if (slot === "UT") continue;
          if (slot === "P") continue;
          if (slot === "INF") {
            for (const p of INF_POSITIONS) {
              if (!eligiblePositions.includes(p)) eligiblePositions.push(p);
            }
            continue;
          }
          if (!eligiblePositions.includes(slot)) eligiblePositions.push(slot);
        }

        if (hasUtil) {
          for (const p of ["C", "1B", "2B", "3B", "SS", "OF", "DH"]) {
            if (!eligiblePositions.includes(p)) eligiblePositions.push(p);
          }
        }

        if (hasInf) {
          for (const p of INF_POSITIONS) {
            if (!eligiblePositions.includes(p)) eligiblePositions.push(p);
          }
        }

        if (hasP) {
          for (const p of ["SP", "RP"]) {
            if (!eligiblePositions.includes(p)) eligiblePositions.push(p);
          }
        }

        if (hasBenchOrIL) {
          for (const p of ["C", "1B", "2B", "3B", "SS", "OF", "SP", "RP", "DH"]) {
            if (!eligiblePositions.includes(p)) eligiblePositions.push(p);
          }
        }
      }

      const leagueType = league.type || "Redraft";
      const scoringFormat = league.scoringFormat || "Roto";
      const season = new Date().getFullYear();

      let selectedPlayer = await storage.getBestAvailableByAdp(
        draftedPlayerIds, leagueType, scoringFormat, season, eligiblePositions
      );

      if (!selectedPlayer) {
        for (const ep of eligiblePositions) {
          selectedPlayer = await storage.getBestAvailablePlayer(draftedPlayerIds, ep);
          if (selectedPlayer) break;
        }
      }

      if (!selectedPlayer) {
        selectedPlayer = await storage.getBestAvailablePlayer(draftedPlayerIds);
      }

      if (!selectedPlayer) {
        return res.status(400).json({ message: "No players available to draft" });
      }

      const pick = await storage.createDraftPick({
        leagueId,
        teamId: pickingTeam.id,
        playerId: selectedPlayer.id,
        overallPick: nextOverall,
        round,
        pickInRound,
      });

      const totalPicks = totalRounds * numTeams;
      if (nextOverall >= totalPicks) {
        await storage.updateLeague(leagueId, { draftStatus: "completed", draftPickStartedAt: null });
        broadcastDraftEvent(leagueId, "draft-status", { draftStatus: "completed" });
        recalculateAdpForLeague(league).catch(e => console.error("ADP recalc error:", e));
        generateLeagueMatchups(leagueId).catch(e => console.error("Matchup gen error:", e));
        autoInitializeRosterSlots(leagueId).catch(e => console.error("Roster init error:", e));
      } else {
        await storage.updateLeague(leagueId, { draftPickStartedAt: new Date().toISOString() });
      }

      broadcastDraftEvent(leagueId, "pick", { overallPick: nextOverall, playerId: selectedPlayer.id, teamId: pickingTeam.id });
      res.status(201).json({ pick, player: selectedPlayer });
    } catch (error) {
      safeErrorResponse(res, "Failed to auto-pick");
    }
  });

  // Swap roster slots (substitute players)
  app.post("/api/leagues/:id/roster-swap", async (req, res) => {
    try {
      const leagueId = parseInt(req.params.id);
      const userId = getSessionUserId(req);
      const { pickIdA, slotA, pickIdB, slotB } = req.body;
      if (!userId || pickIdA === undefined || slotA === undefined || slotB === undefined) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      const league = await storage.getLeague(leagueId);
      if (!league) return res.status(404).json({ message: "League not found" });
      if (league.type === "Best Ball") return res.status(400).json({ message: "Roster management is disabled in Best Ball leagues" });

      const leagueTeams = await storage.getTeamsByLeagueId(leagueId);
      const userTeam = leagueTeams.find(t => t.userId === userId);
      if (!userTeam) return res.status(403).json({ message: "You don't have a team in this league" });

      const rosterPositions = league.rosterPositions || [];
      if (slotA < 0 || slotA >= rosterPositions.length || slotB < 0 || slotB >= rosterPositions.length) {
        return res.status(400).json({ message: "Invalid roster slot index" });
      }

      const pickA = await storage.getDraftPickById(pickIdA);
      if (!pickA || pickA.teamId !== userTeam.id || pickA.leagueId !== leagueId) {
        return res.status(403).json({ message: "Invalid pick" });
      }

      const playerA = await storage.getPlayer(pickA.playerId);
      if (!playerA) return res.status(404).json({ message: "Player not found" });

      const targetSlotPos = rosterPositions[slotB];
      const sourceSlotPos = rosterPositions[slotA];

      const isBBSwap = league.type === "Best Ball";

      if (!canFitSlot(playerA.position, targetSlotPos, isBBSwap)) {
        return res.status(400).json({ message: `${playerA.name} (${playerA.position}) cannot play ${targetSlotPos}` });
      }

      if (pickIdB !== null && pickIdB !== undefined) {
        const pickB = await storage.getDraftPickById(pickIdB);
        if (!pickB || pickB.teamId !== userTeam.id || pickB.leagueId !== leagueId) {
          return res.status(403).json({ message: "Invalid target pick" });
        }
        const playerB = await storage.getPlayer(pickB.playerId);
        if (!playerB) return res.status(404).json({ message: "Target player not found" });

        if (!canFitSlot(playerB.position, sourceSlotPos, isBBSwap)) {
          return res.status(400).json({ message: `${playerB.name} (${playerB.position}) cannot play ${sourceSlotPos}` });
        }

        await storage.swapRosterSlots(leagueId, userTeam.id, pickIdA, slotA, pickIdB, slotB);
      } else {
        await storage.swapRosterSlots(leagueId, userTeam.id, pickIdA, slotA, null, slotB);
      }

      res.json({ message: "Roster swap successful" });
    } catch (error) {
      safeErrorResponse(res, "Failed to swap roster slots");
    }
  });

  // Initialize roster slots after draft completes
  app.post("/api/leagues/:id/init-roster-slots", async (req, res) => {
    try {
      const leagueId = parseInt(req.params.id);
      const userId = getSessionUserId(req);
      if (!userId) return res.status(400).json({ message: "userId is required" });

      const league = await storage.getLeague(leagueId);
      if (!league) return res.status(404).json({ message: "League not found" });

      const leagueTeams = await storage.getTeamsByLeagueId(leagueId);
      const userTeam = leagueTeams.find(t => t.userId === userId);
      if (!userTeam) return res.status(403).json({ message: "No team in this league" });

      const picks = await storage.getDraftPicksByLeague(leagueId);
      const myPicks = picks.filter(p => p.teamId === userTeam.id);

      const allInitialized = myPicks.length > 0 && myPicks.every(p => p.rosterSlot !== null);
      if (allInitialized) {
        return res.json({ message: "Already initialized" });
      }

      const rosterPositions = league.rosterPositions || [];
      const playerObjects: (Player | undefined)[] = await Promise.all(
        myPicks.map(p => storage.getPlayer(p.playerId))
      );

      const assigned = new Array<number | null>(rosterPositions.length).fill(null);
      const usedPickIndices = new Set<number>();

      for (let pass = 0; pass < 4; pass++) {
        for (let pi = 0; pi < myPicks.length; pi++) {
          if (usedPickIndices.has(pi)) continue;
          const player = playerObjects[pi];
          if (!player) continue;

          for (let si = 0; si < rosterPositions.length; si++) {
            if (assigned[si] !== null) continue;
            const slot = rosterPositions[si];

            if (pass === 0) {
              const isExactOrGroup = slot === player.position
                || (slot === "OF" && ["OF", "LF", "CF", "RF"].includes(player.position))
                || (slot === "INF" && INF_POSITIONS.includes(player.position));
              if (isExactOrGroup) {
                assigned[si] = pi;
                usedPickIndices.add(pi);
                break;
              }
            } else if (pass === 1) {
              if ((slot === "UT" && !["SP", "RP"].includes(player.position)) || (slot === "P" && ["SP", "RP"].includes(player.position))) {
                assigned[si] = pi;
                usedPickIndices.add(pi);
                break;
              }
            } else if (pass === 2) {
              if (slot === "BN") {
                assigned[si] = pi;
                usedPickIndices.add(pi);
                break;
              }
            } else if (pass === 3) {
              if (slot === "IL") {
                assigned[si] = pi;
                usedPickIndices.add(pi);
                break;
              }
            }
          }
        }
      }

      for (let si = 0; si < rosterPositions.length; si++) {
        const pi = assigned[si];
        if (pi !== null) {
          await storage.setRosterSlot(myPicks[pi].id, si);
        }
      }

      res.json({ message: "Roster slots initialized" });
    } catch (error) {
      safeErrorResponse(res, "Failed to initialize roster slots");
    }
  });

  // Get drafted player IDs for a league (for filtering available players)
  app.get("/api/leagues/:id/drafted-player-ids", async (req, res) => {
    try {
      const leagueId = parseInt(req.params.id);
      const playerIds = await storage.getDraftedPlayerIds(leagueId);
      res.json(playerIds);
    } catch (error) {
      safeErrorResponse(res, "Failed to fetch drafted player IDs");
    }
  });

  app.get("/api/adp", async (req, res) => {
    try {
      const leagueType = (typeof req.query.type === "string" && req.query.type.trim()) || "Redraft";
      const scoringFormat = (typeof req.query.scoring === "string" && req.query.scoring.trim()) || "Roto";
      const season = parseBoundedInt(req.query.season, 2026, 2000, 2100);
      const limit = parseBoundedInt(req.query.limit, 50, 1, 500);
      const offset = parseBoundedInt(req.query.offset, 0, 0, 100000);
      const result = await storage.getAdp(leagueType, scoringFormat, season, limit, offset);
      res.json(result);
    } catch (error) {
      safeErrorResponse(res, "Failed to fetch ADP data");
    }
  });

  app.get("/api/adp/player/:playerId", async (req, res) => {
    try {
      const playerId = parsePositiveInt(req.params.playerId);
      if (!playerId) return res.status(400).json({ message: "Invalid playerId" });
      const leagueType = (typeof req.query.type === "string" && req.query.type.trim()) || "Redraft";
      const scoringFormat = (typeof req.query.scoring === "string" && req.query.scoring.trim()) || "Roto";
      const season = parseBoundedInt(req.query.season, 2026, 2000, 2100);
      const record = await storage.getPlayerAdp(playerId, leagueType, scoringFormat, season);
      if (!record) {
        return res.status(404).json({ message: "No ADP data for this player" });
      }
      res.json(record);
    } catch (error) {
      safeErrorResponse(res, "Failed to fetch player ADP");
    }
  });

  app.post("/api/adp/recalculate", async (req, res) => {
    try {
      const userId = getSessionUserId(req);
      const admins = getAdminUserIds();
      if (!userId || !admins.has(userId)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const leagueType = (req.body.type as string) || "Redraft";
      const scoringFormat = (req.body.scoring as string) || "Roto";
      const season = parseInt(req.body.season) || 2026;
      await storage.recalculateAdp(leagueType, scoringFormat, season);
      res.json({ message: "ADP recalculated successfully" });
    } catch (error) {
      safeErrorResponse(res, "Failed to recalculate ADP");
    }
  });

  app.post("/api/adp/import", async (req, res) => {
    try {
      const { data, leagueType, scoringFormat, season, weight, mode } = req.body;
      const userId = getSessionUserId(req);
      const admins = getAdminUserIds();
      if (!userId || !admins.has(userId)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      if (!data || typeof data !== "string") {
        return res.status(400).json({ message: "Missing 'data' field with tab-separated player ADP list" });
      }
      const lt = (leagueType as string) || "Redraft";
      const sf = (scoringFormat as string) || "Roto";
      const sn = parseInt(season) || 2026;
      const w = Math.min(Math.max(parseInt(weight) || 100, 1), 1000);
      const importMode = mode === "replace" ? "replace" : "merge";

      const lines = data.split("\n").map((l: string) => l.trim()).filter((l: string) => l && !l.toLowerCase().startsWith("player"));
      const results: { name: string; adp: number; matched: boolean; playerId?: number; playerName?: string }[] = [];

      const allPlayers = await storage.getPlayers();
      const statsWeight = (p: typeof allPlayers[0]) => (p.statAB || 0) + (p.statSO || 0);
      const nameMap = new Map<string, typeof allPlayers[0]>();
      for (const p of allPlayers) {
        const key = p.name.toLowerCase();
        const existing = nameMap.get(key);
        if (!existing || statsWeight(p) > statsWeight(existing)) {
          nameMap.set(key, p);
        }
      }

      const parsed: { name: string; adp: number; player?: typeof allPlayers[0] }[] = [];
      for (const line of lines) {
        const parts = line.split("\t");
        if (parts.length < 2) continue;
        const name = parts[0].trim();
        const adp = parseInt(parts[1].trim());
        if (!name || isNaN(adp)) continue;

        const normalizedName = name.toLowerCase().replace(/\./g, "").replace(/\s+/g, " ");
        let match = nameMap.get(normalizedName);
        if (!match) {
          const entries = Array.from(nameMap.entries());
          for (let i = 0; i < entries.length; i++) {
            const cleanKey = entries[i][0].replace(/\./g, "").replace(/\s+/g, " ");
            if (cleanKey === normalizedName) {
              match = entries[i][1];
              break;
            }
          }
        }
        if (!match) {
          const allP = Array.from(nameMap.values());
          for (let i = 0; i < allP.length; i++) {
            const pName = allP[i].name.toLowerCase().replace(/\./g, "").replace(/\s+/g, " ");
            if (pName.includes(normalizedName) || normalizedName.includes(pName)) {
              match = allP[i];
              break;
            }
          }
        }

        parsed.push({ name, adp, player: match || undefined });
        results.push({
          name,
          adp,
          matched: !!match,
          playerId: match?.id,
          playerName: match?.name,
        });
      }

      const matched = parsed.filter(p => p.player);
      if (matched.length === 0) {
        return res.json({ message: "No players matched", results, matchedCount: 0, totalCount: parsed.length });
      }

      const seenPlayerIds = new Set<number>();
      const deduped = matched.filter(p => {
        if (seenPlayerIds.has(p.player!.id)) return false;
        seenPlayerIds.add(p.player!.id);
        return true;
      });

      await storage.importAdpData(deduped.map(p => ({
        playerId: p.player!.id,
        adp: p.adp,
      })), lt, sf, sn, w, importMode);

      res.json({
        message: `Imported ADP for ${matched.length} players`,
        matchedCount: matched.length,
        totalCount: parsed.length,
        unmatchedCount: parsed.length - matched.length,
        results,
      });
    } catch (error) {
      console.error("ADP import error:", error);
      safeErrorResponse(res, "Failed to import ADP data");
    }
  });

  app.post("/api/adp/import-nfbc", async (_req, res) => {
    res.status(410).json({ message: "NFBC import disabled. ADP is now managed manually via the external_adp column in Supabase. Use POST /api/adp/sync to sync changes." });
  });

  app.get("/api/leagues/:id/available-players", async (req, res) => {
    try {
      const leagueId = parsePositiveInt(req.params.id);
      if (!leagueId) return res.status(400).json({ message: "Invalid league id" });
      const query = sanitizeSearchQuery(req.query.q);
      const position = typeof req.query.position === "string" ? req.query.position : undefined;
      const limit = parseBoundedInt(req.query.limit, 50, 1, 200);
      const offset = parseBoundedInt(req.query.offset, 0, 0, 10000);
      const playerType = typeof req.query.type === "string" ? req.query.type : undefined;
      const rosterStatus = typeof req.query.status === "string" ? req.query.status : undefined;
      const result = await storage.searchAvailablePlayers(leagueId, query, position, limit, offset, playerType, rosterStatus);
      res.json(result);
    } catch (error) {
      safeErrorResponse(res, "Failed to fetch available players");
    }
  });

  app.post("/api/leagues/:id/add-player", async (req, res) => {
    try {
      const leagueId = parseInt(req.params.id);
      const userId = getSessionUserId(req);
      const { playerId } = req.body;
      if (!userId || !playerId) return res.status(400).json({ message: "Missing required fields" });

      const league = await storage.getLeague(leagueId);
      if (!league) return res.status(404).json({ message: "League not found" });
      if (league.type === "Best Ball") return res.status(400).json({ message: "Add/drop is disabled in Best Ball leagues" });

      const leagueTeams = await storage.getTeamsByLeagueId(leagueId);
      const userTeam = leagueTeams.find(t => t.userId === userId);
      if (!userTeam) return res.status(403).json({ message: "You don't have a team in this league" });

      const draftedIds = await storage.getDraftedPlayerIds(leagueId);
      if (draftedIds.includes(playerId)) return res.status(400).json({ message: "Player is already on a roster" });

      const player = await storage.getPlayer(playerId);
      if (!player) return res.status(404).json({ message: "Player not found" });

      const rosterPositions = league.rosterPositions || [];
      const picks = await storage.getDraftPicksByLeague(leagueId);
      const teamPicks = picks.filter(p => p.teamId === userTeam.id);
      const occupiedSlots = new Set(teamPicks.map(p => p.rosterSlot).filter(s => s !== null));

      let assignedSlot: number | null = null;
      for (let i = 0; i < rosterPositions.length; i++) {
        if (occupiedSlots.has(i)) continue;
        const slotPos = rosterPositions[i];
        if (slotPos === "BN" || slotPos === "IL") {
          assignedSlot = i;
          break;
        }
      }

      if (assignedSlot === null) {
        return res.status(400).json({ message: "No open roster slots available. Drop a player first." });
      }

      const pick = await storage.addPlayerToTeam(leagueId, userTeam.id, playerId, assignedSlot);
      
      await storage.createTransaction({
        leagueId,
        teamId: userTeam.id,
        type: 'add',
        playerId,
      });

      res.json({ pick, player });
    } catch (error) {
      safeErrorResponse(res, "Failed to add player");
    }
  });

  app.post("/api/leagues/:id/add-drop", async (req, res) => {
    try {
      const leagueId = parseInt(req.params.id);
      const userId = getSessionUserId(req);
      const { addPlayerId, dropPickId } = req.body;
      if (!userId || !addPlayerId || !dropPickId) return res.status(400).json({ message: "Missing required fields" });

      const league = await storage.getLeague(leagueId);
      if (!league) return res.status(404).json({ message: "League not found" });
      if (league.type === "Best Ball") return res.status(400).json({ message: "Add/drop is disabled in Best Ball leagues" });

      const leagueTeams = await storage.getTeamsByLeagueId(leagueId);
      const userTeam = leagueTeams.find(t => t.userId === userId);
      if (!userTeam) return res.status(403).json({ message: "You don't have a team in this league" });

      const dropPick = await storage.getDraftPickById(dropPickId);
      if (!dropPick || dropPick.teamId !== userTeam.id || dropPick.leagueId !== leagueId) {
        return res.status(403).json({ message: "Invalid pick to drop" });
      }

      const draftedIds = await storage.getDraftedPlayerIds(leagueId);
      if (draftedIds.includes(addPlayerId)) return res.status(400).json({ message: "Player is already on a roster" });

      const player = await storage.getPlayer(addPlayerId);
      if (!player) return res.status(404).json({ message: "Player not found" });

      const waiverCheck = await storage.getActiveWaiverForPlayer(leagueId, addPlayerId);
      if (waiverCheck) return res.status(400).json({ message: "Player is on waivers and cannot be added directly" });

      const rosterSlot = dropPick.rosterSlot ?? 0;
      const droppedPlayerId = dropPick.playerId;
      await storage.dropPlayerFromTeam(dropPickId);

      await storage.createWaiver({
        leagueId,
        playerId: droppedPlayerId,
        droppedByTeamId: userTeam.id,
        waiverExpiresAt: getWaiverExpirationPST(),
        status: "active",
        createdAt: new Date().toISOString(),
      });

      const pick = await storage.addPlayerToTeam(leagueId, userTeam.id, addPlayerId, rosterSlot);
      
      await storage.createTransaction({
        leagueId,
        teamId: userTeam.id,
        type: 'drop',
        playerId: droppedPlayerId,
      });
      await storage.createTransaction({
        leagueId,
        teamId: userTeam.id,
        type: 'add',
        playerId: addPlayerId,
      });

      res.json({ pick, player, message: "Player added and dropped successfully" });
    } catch (error) {
      safeErrorResponse(res, "Failed to add/drop player");
    }
  });

  app.post("/api/leagues/:id/drop-player", async (req, res) => {
    try {
      const leagueId = parseInt(req.params.id);
      const userId = getSessionUserId(req);
      const { pickId } = req.body;
      if (!userId || !pickId) return res.status(400).json({ message: "Missing required fields" });

      const league = await storage.getLeague(leagueId);
      if (!league) return res.status(404).json({ message: "League not found" });
      if (league.type === "Best Ball") return res.status(400).json({ message: "Drop is disabled in Best Ball leagues" });

      const leagueTeams = await storage.getTeamsByLeagueId(leagueId);
      const userTeam = leagueTeams.find(t => t.userId === userId);
      if (!userTeam) return res.status(403).json({ message: "You don't have a team in this league" });

      const pick = await storage.getDraftPickById(pickId);
      if (!pick || pick.teamId !== userTeam.id || pick.leagueId !== leagueId) {
        return res.status(403).json({ message: "Invalid pick" });
      }

      const droppedPlayerId = pick.playerId;
      await storage.dropPlayerFromTeam(pickId);

      await storage.createWaiver({
        leagueId,
        playerId: droppedPlayerId,
        droppedByTeamId: userTeam.id,
        waiverExpiresAt: getWaiverExpirationPST(),
        status: "active",
        createdAt: new Date().toISOString(),
      });

      await storage.createTransaction({
        leagueId,
        teamId: userTeam.id,
        type: 'drop',
        playerId: droppedPlayerId,
      });

      res.json({ message: "Player dropped successfully — on waivers for 2 days" });
    } catch (error) {
      safeErrorResponse(res, "Failed to drop player");
    }
  });

  app.get("/api/leagues/:id/waivers", async (req, res) => {
    try {
      const leagueId = parseInt(req.params.id);
      const league = await storage.getLeague(leagueId);
      if (!league) return res.status(404).json({ message: "League not found" });
      if (league.type === "Best Ball") return res.json([]);
      const activeWaivers = await storage.getActiveWaiversByLeague(leagueId);
      const waiversWithPlayers = await Promise.all(activeWaivers.map(async (w) => {
        const player = await storage.getPlayer(w.playerId);
        const claims = await storage.getClaimsForWaiver(w.id);
        return { ...w, player, claimCount: claims.length };
      }));
      res.json(waiversWithPlayers);
    } catch (error) {
      safeErrorResponse(res, "Failed to fetch waivers");
    }
  });

  app.get("/api/leagues/:id/my-claims", async (req, res) => {
    try {
      const leagueId = parseInt(req.params.id);
      const userId = getSessionUserId(req);
      if (!userId) return res.status(400).json({ message: "Missing userId" });
      const league = await storage.getLeague(leagueId);
      if (!league) return res.status(404).json({ message: "League not found" });
      if (league.type === "Best Ball") return res.json([]);

      const leagueTeams = await storage.getTeamsByLeagueId(leagueId);
      const userTeam = leagueTeams.find(t => t.userId === userId);
      if (!userTeam) return res.json([]);

      const claims = await storage.getClaimsByTeam(userTeam.id);
      const activeClaims = [];
      for (const claim of claims) {
        const waiver = await storage.getWaiver(claim.waiverId);
        if (waiver && waiver.status === "active" && waiver.leagueId === leagueId) {
          const player = await storage.getPlayer(waiver.playerId);
          let dropPlayer = null;
          if (claim.dropPickId) {
            const dropPick = await storage.getDraftPickById(claim.dropPickId);
            if (dropPick) dropPlayer = await storage.getPlayer(dropPick.playerId);
          }
          activeClaims.push({
            ...claim,
            waiver,
            player,
            dropPlayer,
          });
        }
      }
      res.json(activeClaims);
    } catch (error) {
      safeErrorResponse(res, "Failed to fetch claims");
    }
  });

  app.post("/api/leagues/:id/waiver-claim", async (req, res) => {
    try {
      const leagueId = parseInt(req.params.id);
      const userId = getSessionUserId(req);
      const { playerId, dropPickId } = req.body;
      if (!userId || !playerId) return res.status(400).json({ message: "Missing required fields" });

      const league = await storage.getLeague(leagueId);
      if (!league) return res.status(404).json({ message: "League not found" });
      if (league.type === "Best Ball") return res.status(400).json({ message: "Waivers are disabled in Best Ball leagues" });

      const leagueTeams = await storage.getTeamsByLeagueId(leagueId);
      const userTeam = leagueTeams.find(t => t.userId === userId);
      if (!userTeam) return res.status(403).json({ message: "You don't have a team in this league" });

      const waiver = await storage.getActiveWaiverForPlayer(leagueId, playerId);
      if (!waiver) return res.status(404).json({ message: "No active waiver for this player" });

      const existingClaims = await storage.getClaimsForWaiver(waiver.id);
      const alreadyClaimed = existingClaims.find(c => c.teamId === userTeam.id);
      if (alreadyClaimed) return res.status(400).json({ message: "You already have a claim on this player" });

      const teamPicks = await storage.getDraftPicksByLeague(leagueId);
      const myPicks = teamPicks.filter(p => p.teamId === userTeam.id);
      const rosterPositions = league.rosterPositions || [];
      const maxRoster = getDraftRounds(league);
      const hasOpenSlot = myPicks.length < maxRoster;

      if (!hasOpenSlot && !dropPickId) {
        return res.status(400).json({ message: "Roster is full — select a player to drop" });
      }

      if (dropPickId) {
        const dropPick = await storage.getDraftPickById(dropPickId);
        if (!dropPick || dropPick.teamId !== userTeam.id || dropPick.leagueId !== leagueId) {
          return res.status(403).json({ message: "Invalid player to drop" });
        }
      }

      const claim = await storage.createWaiverClaim({
        waiverId: waiver.id,
        teamId: userTeam.id,
        dropPickId: dropPickId || null,
        createdAt: new Date().toISOString(),
      });
      res.json({ claim, message: "Waiver claim submitted" });
    } catch (error) {
      safeErrorResponse(res, "Failed to submit waiver claim");
    }
  });

  app.get("/api/leagues/:id/transactions", async (req, res) => {
    try {
      const leagueId = parseInt(req.params.id);
      const transactions = await storage.getTransactionsByLeague(leagueId);
      const transactionsWithDetails = await Promise.all(transactions.map(async (t) => {
        const team = await storage.getTeam(t.teamId);
        const teamB = t.teamBId ? await storage.getTeam(t.teamBId) : null;
        const player = t.playerId ? await storage.getPlayer(t.playerId) : null;
        const playerB = t.playerBId ? await storage.getPlayer(t.playerBId) : null;
        return {
          ...t,
          teamName: team?.name || "Unknown Team",
          teamBName: teamB?.name,
          playerName: player?.name,
          playerBName: playerB?.name,
          playerAvatar: player?.avatar,
          playerBAvatar: playerB?.avatar,
        };
      }));
      res.json(transactionsWithDetails);
    } catch (error) {
      safeErrorResponse(res, "Failed to fetch transactions");
    }
  });

  app.delete("/api/leagues/:id/waiver-claim/:claimId", async (req, res) => {
    try {
      const leagueId = parseInt(req.params.id);
      const claimId = parseInt(req.params.claimId);
      const userId = getSessionUserId(req);
      if (!userId) return res.status(400).json({ message: "Missing userId" });
      const league = await storage.getLeague(leagueId);
      if (!league) return res.status(404).json({ message: "League not found" });
      if (league.type === "Best Ball") return res.status(400).json({ message: "Waivers are disabled in Best Ball leagues" });

      const leagueTeams = await storage.getTeamsByLeagueId(leagueId);
      const userTeam = leagueTeams.find(t => t.userId === userId);
      if (!userTeam) return res.status(403).json({ message: "You don't have a team in this league" });

      const claims = await storage.getClaimsByTeam(userTeam.id);
      const claim = claims.find(c => c.id === claimId);
      if (!claim) return res.status(404).json({ message: "Claim not found" });

      await storage.deleteWaiverClaim(claimId);
      res.json({ message: "Waiver claim cancelled" });
    } catch (error) {
      safeErrorResponse(res, "Failed to cancel waiver claim");
    }
  });

  app.post("/api/import-stats", async (req, res) => {
    try {
      const userId = getSessionUserId(req);
      const admins = getAdminUserIds();
      if (!userId || !admins.has(userId)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const { importSeasonStats } = await import("./import-stats");
      const season = req.body.season ? parseInt(req.body.season) : undefined;
      res.json({ message: `Stats import started for season ${season || 2025}` });
      importSeasonStats(season).then(result => {
        console.log("Stats import finished:", result);
      }).catch(e => console.error("Stats import error:", e));
    } catch (error) {
      console.error("Import stats error:", error);
      safeErrorResponse(res, "Failed to start stats import");
    }
  });

  app.get("/api/leagues/:id/daily-lineup", async (req, res) => {
    try {
      const leagueId = parseInt(req.params.id);
      const teamId = parseInt(req.query.teamId as string);
      const date = req.query.date as string;
      if (!teamId || !date) {
        return res.status(400).json({ message: "teamId and date required" });
      }

      let lineup = await storage.getDailyLineup(leagueId, teamId, date);
      const today = new Date().toISOString().split("T")[0];
      const isPast = date < today;

      if (lineup.length === 0) {
        const league = await storage.getLeague(leagueId);
        if (!league) return res.status(404).json({ message: "League not found" });
        const rosterPositions = league.rosterPositions || [];

        const dates = await storage.getDailyLineupDates(leagueId, teamId);
        const previousDate = dates.find(d => d < date);

        let entries: Array<{ leagueId: number; teamId: number; date: string; slotIndex: number; slotPos: string; playerId: number | null }> = [];

        if (previousDate) {
          const prevLineup = await storage.getDailyLineup(leagueId, teamId, previousDate);
          entries = prevLineup.map(e => ({
            leagueId,
            teamId,
            date,
            slotIndex: e.slotIndex,
            slotPos: e.slotPos,
            playerId: e.playerId,
          }));
        } else {
          const draftPicks = await storage.getDraftPicksByLeague(leagueId);
          const teamPicks = draftPicks.filter(p => p.teamId === teamId);
          entries = rosterPositions.map((pos, idx) => {
            const pick = teamPicks.find(p => p.rosterSlot === idx);
            return {
              leagueId,
              teamId,
              date,
              slotIndex: idx,
              slotPos: pos,
              playerId: pick ? pick.playerId : null,
            };
          });
        }

        if (entries.length > 0) {
          if (!isPast) {
            await storage.saveDailyLineup(entries);
            lineup = await storage.getDailyLineup(leagueId, teamId, date);
          } else {
            lineup = entries.map((e, i) => ({ id: -(i + 1), ...e }));
          }
        }
      }

      res.json(lineup);
    } catch (error) {
      console.error("Get daily lineup error:", error);
      safeErrorResponse(res, "Failed to fetch daily lineup");
    }
  });

  app.post("/api/leagues/:id/daily-lineup/swap", async (req, res) => {
    try {
      const leagueId = parseInt(req.params.id);
      const { teamId, date, slotIndexA, slotIndexB } = req.body;
      if (!teamId || !date || slotIndexA === undefined || slotIndexB === undefined) {
        return res.status(400).json({ message: "teamId, date, slotIndexA, slotIndexB required" });
      }

      const bbLeague = await storage.getLeague(leagueId);
      if (bbLeague?.type === "Best Ball") return res.status(400).json({ message: "Lineup management is disabled in Best Ball leagues" });

      const today = new Date().toISOString().split("T")[0];
      if (date < today) {
        return res.status(400).json({ message: "Cannot modify past lineups" });
      }

      let lineup = await storage.getDailyLineup(leagueId, teamId, date);

      if (lineup.length === 0) {
        const league = await storage.getLeague(leagueId);
        if (!league) return res.status(404).json({ message: "League not found" });
        const rosterPositions = league.rosterPositions || [];
        const dates = await storage.getDailyLineupDates(leagueId, teamId);
        const previousDate = dates.find(d => d < date);
        if (previousDate) {
          const prevLineup = await storage.getDailyLineup(leagueId, teamId, previousDate);
          const entries = prevLineup.map(e => ({
            leagueId, teamId, date,
            slotIndex: e.slotIndex, slotPos: e.slotPos, playerId: e.playerId,
          }));
          if (entries.length > 0) {
            await storage.saveDailyLineup(entries);
            lineup = await storage.getDailyLineup(leagueId, teamId, date);
          }
        } else {
          const draftPicks = await storage.getDraftPicksByLeague(leagueId);
          const teamPicks = draftPicks.filter(p => p.teamId === teamId);
          const entries = rosterPositions.map((pos, idx) => {
            const pick = teamPicks.find(p => p.rosterSlot === idx);
            return { leagueId, teamId, date, slotIndex: idx, slotPos: pos, playerId: pick ? pick.playerId : null };
          });
          if (entries.length > 0) {
            await storage.saveDailyLineup(entries);
            lineup = await storage.getDailyLineup(leagueId, teamId, date);
          }
        }
      }

      const entryA = lineup.find(e => e.slotIndex === slotIndexA);
      const entryB = lineup.find(e => e.slotIndex === slotIndexB);
      if (!entryA || !entryB) {
        return res.status(400).json({ message: "Invalid slot indices" });
      }

      const playerIdA = entryA.playerId;
      const playerIdB = entryB.playerId;

      const applySwapToLineup = (dayLineup: typeof lineup, targetDate: string) => {
        return dayLineup.map(e => {
          if (e.slotIndex === slotIndexA) {
            return { leagueId, teamId, date: targetDate, slotIndex: e.slotIndex, slotPos: e.slotPos, playerId: playerIdB };
          }
          if (e.slotIndex === slotIndexB) {
            return { leagueId, teamId, date: targetDate, slotIndex: e.slotIndex, slotPos: e.slotPos, playerId: playerIdA };
          }
          return { leagueId, teamId, date: targetDate, slotIndex: e.slotIndex, slotPos: e.slotPos, playerId: e.playerId };
        });
      };

      await storage.deleteDailyLineupFromDate(leagueId, teamId, date);
      await storage.saveDailyLineup(applySwapToLineup(lineup, date));

      const newLineup = await storage.getDailyLineup(leagueId, teamId, date);
      res.json(newLineup);
    } catch (error) {
      console.error("Daily lineup swap error:", error);
      safeErrorResponse(res, "Failed to swap daily lineup");
    }
  });

  const httpServer = createServer(app);

  let draftPickCheckInProgress = false;
  async function checkExpiredDraftPicks() {
    if (draftPickCheckInProgress) return;
    draftPickCheckInProgress = true;
    try {
      let activeLeagues: Awaited<ReturnType<typeof storage.getActiveDraftLeagues>>;
      try {
        activeLeagues = await storage.getActiveDraftLeagues();
      } catch (err) {
        console.error("Error fetching active draft leagues:", (err as Error).message);
        return;
      }
      for (const league of activeLeagues) {
        try {
          if (!league.draftPickStartedAt) continue;
        const secondsPerPick = league.secondsPerPick || 60;

        const rawLeagueTeams = await storage.getTeamsByLeagueId(league.id);
        const leagueTeams = [...rawLeagueTeams].sort((a, b) => (a.draftPosition || 999) - (b.draftPosition || 999));
        const numTeams = leagueTeams.length;
        if (numTeams === 0) continue;

        const preCheckPicks = await storage.getDraftPicksByLeague(league.id);
        const preNextOverall = preCheckPicks.length + 1;
        const totalRounds = getDraftRounds(league);
        if (preNextOverall > totalRounds * numTeams) {
          await storage.updateLeague(league.id, { draftStatus: "completed", draftPickStartedAt: null });
          broadcastDraftEvent(league.id, "draft-status", { draftStatus: "completed" });
          recalculateAdpForLeague(league).catch(e => console.error("ADP recalc error:", e));
          generateLeagueMatchups(league.id).catch(e => console.error("Matchup gen error:", e));
          autoInitializeRosterSlots(league.id).catch(e => console.error("Roster init error:", e));
          continue;
        }

        const preRound = Math.ceil(preNextOverall / numTeams);
        const prePickInRound = ((preNextOverall - 1) % numTeams) + 1;
        const preIsEvenRound = preRound % 2 === 1;
        const preTeamIndex = preIsEvenRound ? prePickInRound - 1 : numTeams - prePickInRound;
        const pickingTeam = leagueTeams[preTeamIndex];
        if (!pickingTeam) continue;

        const isCpuTeam = pickingTeam.isCpu === true;
        if (!isCpuTeam) {
          const startedAt = new Date(league.draftPickStartedAt!).getTime();
          const elapsed = (Date.now() - startedAt) / 1000;
          if (elapsed < secondsPerPick) continue;
        }

        let continuePicking = true;
        while (continuePicking) {
          continuePicking = false;

          const pickResult = await withLeagueDraftLock(league.id, async () => {
            const existingPicks = await storage.getDraftPicksByLeague(league.id);
            const rosterPositions = league.rosterPositions || [];
            const nextOverall = existingPicks.length + 1;
            if (nextOverall > totalRounds * numTeams) {
              await storage.updateLeague(league.id, { draftStatus: "completed", draftPickStartedAt: null });
              recalculateAdpForLeague(league).catch(e => console.error("ADP recalc error:", e));
              generateLeagueMatchups(league.id).catch(e => console.error("Matchup gen error:", e));
              autoInitializeRosterSlots(league.id).catch(e => console.error("Roster init error:", e));
              return { completed: true, pick: null, nextTeamIsCpu: false };
            }

            const round = Math.ceil(nextOverall / numTeams);
            const pickInRound = ((nextOverall - 1) % numTeams) + 1;
            const isEvenRound = round % 2 === 1;
            const teamIndex = isEvenRound ? pickInRound - 1 : numTeams - pickInRound;
            const currentPickingTeam = leagueTeams[teamIndex];
            if (!currentPickingTeam) return null;

            const draftedPlayerIds = await storage.getDraftedPlayerIds(league.id);
            const teamPicks = existingPicks.filter(p => p.teamId === currentPickingTeam.id);
            const teamPlayerIds = teamPicks.map(p => p.playerId);

            const teamPlayers: { position: string }[] = [];
            for (const pid of teamPlayerIds) {
              const pl = await storage.getPlayer(pid);
              if (pl) teamPlayers.push({ position: pl.position });
            }

            const isBestBallInterval = league.type === "Best Ball";
            const leagueType = league.type || "Redraft";
            const scoringFormat = league.scoringFormat || "Roto";
            const season = new Date().getFullYear();

            const eligiblePositions: string[] = [];

            if (isBestBallInterval) {
              for (const p of ["C", "1B", "2B", "3B", "SS", "OF", "SP", "RP", "DH"]) {
                eligiblePositions.push(p);
              }
            } else {
              const filledSlots = new Set<number>();
              for (const tp of teamPlayers) {
                const idx = rosterPositions.findIndex((slot, i) => {
                  if (filledSlots.has(i)) return false;
                  if (slot === tp.position) return true;
                  if (slot === "OF" && ["OF", "LF", "CF", "RF"].includes(tp.position)) return true;
                  if (slot === "INF" && INF_POSITIONS.includes(tp.position)) return true;
                  return false;
                });
                if (idx !== -1) filledSlots.add(idx);
                else {
                  if (!["SP", "RP"].includes(tp.position)) {
                    const utilIdx = rosterPositions.findIndex((s, i) => !filledSlots.has(i) && s === "UT");
                    if (utilIdx !== -1) filledSlots.add(utilIdx);
                    else {
                      const bnIdx = rosterPositions.findIndex((s, i) => !filledSlots.has(i) && s === "BN");
                      if (bnIdx !== -1) filledSlots.add(bnIdx);
                    }
                  } else {
                    const pIdx = rosterPositions.findIndex((s, i) => !filledSlots.has(i) && s === "P");
                    if (pIdx !== -1) filledSlots.add(pIdx);
                    else {
                      const bnIdx = rosterPositions.findIndex((s, i) => !filledSlots.has(i) && s === "BN");
                      if (bnIdx !== -1) filledSlots.add(bnIdx);
                    }
                  }
                }
              }

              const emptySlotPositions: string[] = [];
              for (let i = 0; i < rosterPositions.length; i++) {
                if (!filledSlots.has(i)) emptySlotPositions.push(rosterPositions[i]);
              }

              const hasBenchOrIL = emptySlotPositions.some(s => s === "BN" || s === "IL");
              const hasUtil = emptySlotPositions.some(s => s === "UT");
              const hasP = emptySlotPositions.some(s => s === "P");
              const hasInf = emptySlotPositions.some(s => s === "INF");

              for (const slot of emptySlotPositions) {
                if (slot === "BN" || slot === "IL") continue;
                if (slot === "UT") continue;
                if (slot === "P") continue;
                if (slot === "INF") {
                  for (const p of INF_POSITIONS) {
                    if (!eligiblePositions.includes(p)) eligiblePositions.push(p);
                  }
                  continue;
                }
                if (!eligiblePositions.includes(slot)) eligiblePositions.push(slot);
              }

              if (hasUtil) {
                for (const p of ["C", "1B", "2B", "3B", "SS", "OF", "DH"]) {
                  if (!eligiblePositions.includes(p)) eligiblePositions.push(p);
                }
              }

              if (hasInf) {
                for (const p of INF_POSITIONS) {
                  if (!eligiblePositions.includes(p)) eligiblePositions.push(p);
                }
              }

              if (hasP) {
                for (const p of ["SP", "RP"]) {
                  if (!eligiblePositions.includes(p)) eligiblePositions.push(p);
                }
              }

              if (hasBenchOrIL) {
                for (const p of ["C", "1B", "2B", "3B", "SS", "OF", "SP", "RP", "DH"]) {
                  if (!eligiblePositions.includes(p)) eligiblePositions.push(p);
                }
              }
            }

            let selectedPlayer = await storage.getBestAvailableByAdp(
              draftedPlayerIds, leagueType, scoringFormat, season, eligiblePositions
            );

            if (!selectedPlayer) {
              for (const ep of eligiblePositions) {
                selectedPlayer = await storage.getBestAvailablePlayer(draftedPlayerIds, ep);
                if (selectedPlayer) break;
              }
            }

            if (!selectedPlayer) {
              selectedPlayer = await storage.getBestAvailablePlayer(draftedPlayerIds);
            }
            if (!selectedPlayer) {
              await storage.updateLeague(league.id, { draftStatus: "completed", draftPickStartedAt: null });
              recalculateAdpForLeague(league).catch(e => console.error("ADP recalc error:", e));
              generateLeagueMatchups(league.id).catch(e => console.error("Matchup gen error:", e));
              autoInitializeRosterSlots(league.id).catch(e => console.error("Roster init error:", e));
              return { completed: true, pick: null, nextTeamIsCpu: false };
            }

            try {
              await storage.createDraftPick({
                leagueId: league.id,
                teamId: currentPickingTeam.id,
                playerId: selectedPlayer.id,
                overallPick: nextOverall,
                round,
                pickInRound,
              });

              const totalPicks = totalRounds * numTeams;
              if (nextOverall >= totalPicks) {
                await storage.updateLeague(league.id, { draftStatus: "completed", draftPickStartedAt: null });
                recalculateAdpForLeague(league).catch(e => console.error("ADP recalc error:", e));
                generateLeagueMatchups(league.id).catch(e => console.error("Matchup gen error:", e));
                autoInitializeRosterSlots(league.id).catch(e => console.error("Roster init error:", e));
                return {
                  completed: true,
                  pick: { overallPick: nextOverall, playerId: selectedPlayer.id, teamId: currentPickingTeam.id },
                  nextTeamIsCpu: false,
                };
              } else {
                await storage.updateLeague(league.id, { draftPickStartedAt: new Date().toISOString() });
                const nextNextOverall = nextOverall + 1;
                const nextRound = Math.ceil(nextNextOverall / numTeams);
                const nextPickInRound = ((nextNextOverall - 1) % numTeams) + 1;
                const nextIsEvenRound = nextRound % 2 === 1;
                const nextTeamIndex = nextIsEvenRound ? nextPickInRound - 1 : numTeams - nextPickInRound;
                const nextTeam = leagueTeams[nextTeamIndex];
                return {
                  completed: false,
                  pick: { overallPick: nextOverall, playerId: selectedPlayer.id, teamId: currentPickingTeam.id },
                  nextTeamIsCpu: nextTeam?.isCpu === true,
                };
              }
            } catch (insertErr: any) {
              if (insertErr?.message?.includes("unique") || insertErr?.code === "23505") {
                console.log(`Duplicate pick prevented by DB constraint for league ${league.id}, pick ${nextOverall}`);
              } else {
                throw insertErr;
              }
              return null;
            }
          });

          if (pickResult?.pick) {
            broadcastDraftEvent(league.id, "pick", pickResult.pick);
          }
          if (pickResult?.completed) {
            broadcastDraftEvent(league.id, "draft-status", { draftStatus: "completed" });
          } else if (pickResult?.nextTeamIsCpu) {
            await new Promise(r => setTimeout(r, 1200));
            continuePicking = true;
          }
        }
        } catch (leagueErr) {
          console.error(`Error processing draft for league ${league.id} (${league.name}):`, (leagueErr as Error).message);
        }
      }
    } catch (error) {
      console.error("Error checking expired draft picks:", error);
    } finally {
      draftPickCheckInProgress = false;
    }
  }

  setInterval(checkExpiredDraftPicks, 15000);

  const AUTO_DRAFT_PUSHBACK_MS = 5 * 60 * 1000;

  async function checkScheduledDrafts() {
    try {
      const scheduled = await storage.getScheduledDraftLeagues();
      for (const league of scheduled) {
        try {
          if (!league.draftDate) continue;
          const draftTime = new Date(league.draftDate).getTime();
          if (isNaN(draftTime) || Date.now() < draftTime) continue;

          const allTeams = await storage.getTeamsByLeagueId(league.id);

          // Only start if the league is full (all spots occupied by real users or bots)
          const humanAndBotCount = allTeams.filter(t => !t.isCpu).length;
          const maxT = league.maxTeams || league.numberOfTeams || 12;

          // If full but all teams are bots, do not run the draft — delete the league.
          const nonCpuUserIds = allTeams
            .filter(t => !t.isCpu && t.userId != null)
            .map(t => t.userId!) as number[];
          let realUserCount = 0;
          if (nonCpuUserIds.length > 0) {
            const realUsers = await db.select({ id: users.id })
              .from(users)
              .where(and(inArray(users.id, nonCpuUserIds), eq(users.isBot, false)));
            realUserCount = realUsers.length;
          }
          if (humanAndBotCount >= maxT && realUserCount === 0) {
            await storage.deleteLeague(league.id);
            console.log(`[Auto-start] Deleted full all-bot league ${league.id} (${league.name}) before draft start`);
            continue;
          }

          if (humanAndBotCount < maxT) {
            // Auto-created leagues have no commissioner (createdBy null).
            // If they are not full at scheduled time, defer by 5 minutes.
            if (league.createdBy == null) {
              const nextDraftDate = new Date(draftTime + AUTO_DRAFT_PUSHBACK_MS).toISOString();
              await storage.updateLeague(league.id, { draftDate: nextDraftDate } as any);
              broadcastDraftEvent(league.id, "league-settings", { draftDate: nextDraftDate });
              console.log(`[Auto-start] League ${league.id} not full; pushed draftDate +5m to ${nextDraftDate}`);
            }
            continue;
          }

          const hasPositions = allTeams.some(t => t.draftPosition);
          if (!hasPositions) {
            const shuffled = [...allTeams].sort(() => Math.random() - 0.5);
            for (let i = 0; i < shuffled.length; i++) {
              await storage.updateTeam(shuffled[i].id, { draftPosition: i + 1 } as any);
            }
          } else {
            const maxSlots = maxT;
            const usedPositions = new Set(allTeams.filter(t => t.draftPosition).map(t => t.draftPosition!));
            const availablePositions: number[] = [];
            for (let p = 1; p <= maxSlots; p++) {
              if (!usedPositions.has(p)) availablePositions.push(p);
            }
            let idx = 0;
            for (const t of allTeams) {
              if (!t.draftPosition && idx < availablePositions.length) {
                await storage.updateTeam(t.id, { draftPosition: availablePositions[idx++] } as any);
              }
            }
          }

          await storage.updateLeague(league.id, {
            draftStatus: "active",
            draftPickStartedAt: new Date().toISOString(),
          });
          broadcastDraftEvent(league.id, "draft-status", { action: "start", draftStatus: "active" });
          broadcastDraftEvent(league.id, "teams-update");
          console.log(`[Auto-start] Draft started for league ${league.id} (${league.name}) at scheduled time`);
        } catch (err) {
          console.error(`Error auto-starting draft for league ${league.id}:`, (err as Error).message);
        }
      }
    } catch (error) {
      console.error("Error checking scheduled drafts:", error);
    }
  }
  setInterval(checkScheduledDrafts, 60000);

  async function checkWeeklyBestBallFinalization() {
    try {
      const writes = await finalizeBestBallWeeklySnapshots(new Date());
      if (writes > 0) {
        console.log(`[Best Ball Weekly] Finalized ${writes} team-week snapshot(s).`);
      }
    } catch (error) {
      console.error("[Best Ball Weekly] Finalization check error:", error);
    }
  }
  setInterval(checkWeeklyBestBallFinalization, 60000);

  (async function migrateMinorLeagueTeams() {
    try {
      const nonMlb = await db.select({ id: players.id }).from(players).where(ne(players.mlbLevel, "MLB")).limit(1);
      if (nonMlb.length === 0) {
        console.log("[Migration] All players already mapped to MLB parent orgs, skipping.");
        return;
      }
      console.log("[Migration] Found players with minor league teams, fetching MLB org hierarchy...");
      const res = await fetch("https://statsapi.mlb.com/api/v1/teams?sportIds=1,11,12,13,14,16&season=2025&activeStatus=Y");
      if (!res.ok) throw new Error(`MLB API returned ${res.status}`);
      const data = await res.json();
      const apiTeams: { id: number; name: string; abbreviation: string; sport: { id: number }; parentOrgId?: number }[] = data.teams || [];

      const mlbOrgs = new Map<number, { name: string; abbreviation: string }>();
      for (const t of apiTeams) {
        if (t.sport.id === 1) mlbOrgs.set(t.id, { name: t.name, abbreviation: t.abbreviation });
      }

      const minorToParent = new Map<string, { name: string; abbreviation: string }>();
      for (const t of apiTeams) {
        if (t.sport.id !== 1 && t.parentOrgId && mlbOrgs.has(t.parentOrgId)) {
          const parent = mlbOrgs.get(t.parentOrgId)!;
          minorToParent.set(t.name, parent);
          minorToParent.set(t.abbreviation, parent);
        }
      }

      const allPlayers = await db.select({
        id: players.id,
        team: players.team,
        teamAbbreviation: players.teamAbbreviation,
        mlbLevel: players.mlbLevel,
      }).from(players);

      let updated = 0;
      for (const p of allPlayers) {
        const updates: Record<string, unknown> = {};
        if (p.mlbLevel !== "MLB") updates.mlbLevel = "MLB";
        const parent = minorToParent.get(p.team) || (p.teamAbbreviation ? minorToParent.get(p.teamAbbreviation) : null);
        if (parent) {
          updates.team = parent.name;
          updates.teamAbbreviation = parent.abbreviation;
        }
        if (Object.keys(updates).length > 0) {
          await db.update(players).set(updates).where(eq(players.id, p.id));
          updated++;
        }
      }
      console.log(`[Migration] Updated ${updated} players to MLB parent orgs.`);
    } catch (err) {
      console.error("[Migration] Failed to migrate minor league teams:", (err as Error).message);
    }
  })();

  (async function createAdpEditorView() {
    try {
      await db.execute(sql`
        CREATE OR REPLACE VIEW player_adp_editor AS
        SELECT id, name, position, team, team_abbreviation, external_adp
        FROM players
        ORDER BY external_adp ASC NULLS LAST, name ASC
      `);
      console.log("[Startup] Created/updated player_adp_editor view");
    } catch (err) {
      console.error("[Startup] Failed to create player_adp_editor view:", (err as Error).message);
    }
  })();

  async function syncExternalAdpToTable() {
    try {
      const allPlayers = await db.select({
        id: players.id,
        externalAdp: players.externalAdp,
      }).from(players);

      const LEAGUE_TYPES = ["Redraft", "Best Ball", "Keeper", "Dynasty"];
      const SCORING_FORMATS = ["Roto", "H2H Points", "H2H Each Category", "H2H Most Categories", "Season Points"];
      const season = new Date().getFullYear();

      for (const leagueType of LEAGUE_TYPES) {
        for (const scoringFormat of SCORING_FORMATS) {
          await db.delete(playerAdp).where(
            and(
              eq(playerAdp.leagueType, leagueType),
              eq(playerAdp.scoringFormat, scoringFormat),
              eq(playerAdp.season, season)
            )
          );

          const rows = allPlayers.map(p => ({
            playerId: p.id,
            leagueType,
            scoringFormat,
            season,
            adp: p.externalAdp || 9999,
            draftCount: p.externalAdp ? 1 : 0,
            totalPositionSum: p.externalAdp ? p.externalAdp : 0,
          }));

          const BATCH = 500;
          for (let i = 0; i < rows.length; i += BATCH) {
            await db.insert(playerAdp).values(rows.slice(i, i + BATCH));
          }
        }
      }

      const withAdp = allPlayers.filter(p => p.externalAdp != null).length;
      console.log(`[ADP Sync] Synced ${withAdp} players with ADP across ${LEAGUE_TYPES.length * SCORING_FORMATS.length} combinations`);
    } catch (err) {
      console.error("[ADP Sync] Failed:", (err as Error).message);
    }
  }

  const adpStartupSyncEnabled = ["1", "true", "yes", "on", "enabled"]
    .includes((process.env.ADP_STARTUP_SYNC_ENABLED || "false").trim().toLowerCase());
  if (adpStartupSyncEnabled) {
    syncExternalAdpToTable();
  } else {
    console.log("[ADP Sync] Startup sync skipped (set ADP_STARTUP_SYNC_ENABLED=true to enable)");
  }

  app.post("/api/adp/sync", async (req, res) => {
    try {
      const userId = getSessionUserId(req);
      const admins = getAdminUserIds();
      if (!userId || !admins.has(userId)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      await syncExternalAdpToTable();
      res.json({ message: "ADP sync complete" });
    } catch (error) {
      safeErrorResponse(res, "Failed to sync ADP");
    }
  });

  app.post("/api/adp/upload-csv", async (req, res) => {
    try {
      const userId = getSessionUserId(req);
      const admins = getAdminUserIds();
      if (!userId || !admins.has(userId)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const { csv } = req.body;
      if (!csv || typeof csv !== "string") {
        return res.status(400).json({ message: "Missing 'csv' field with CSV text" });
      }

      const lines = csv.split("\n").map(l => l.trim()).filter(l => l);
      const header = lines[0].toLowerCase();
      if (!header.includes("id") || !header.includes("external_adp")) {
        return res.status(400).json({ message: "CSV must have 'id' and 'external_adp' columns" });
      }

      const cols = lines[0].split(",").map(c => c.trim().toLowerCase());
      const idIdx = cols.indexOf("id");
      const adpIdx = cols.findIndex(c => c === "external_adp" || c === "adp");
      if (idIdx === -1 || adpIdx === -1) {
        return res.status(400).json({ message: "Could not find 'id' and 'external_adp' columns" });
      }

      let updated = 0;
      let skipped = 0;
      for (let i = 1; i < lines.length; i++) {
        const cells = lines[i].split(",").map(c => c.trim().replace(/^"|"$/g, ""));
        const playerId = parseInt(cells[idIdx]);
        const adpVal = cells[adpIdx];

        if (isNaN(playerId)) { skipped++; continue; }

        if (!adpVal || adpVal === "" || adpVal.toLowerCase() === "null") {
          await db.update(players).set({ externalAdp: null }).where(eq(players.id, playerId));
          updated++;
        } else {
          const adpNum = parseInt(adpVal);
          if (isNaN(adpNum)) { skipped++; continue; }
          await db.update(players).set({ externalAdp: adpNum }).where(eq(players.id, playerId));
          updated++;
        }
      }

      res.json({ message: `Updated ${updated} players, skipped ${skipped} rows` });
    } catch (error) {
      console.error("CSV upload error:", error);
      safeErrorResponse(res, "Failed to process CSV");
    }
  });

  return httpServer;
}
