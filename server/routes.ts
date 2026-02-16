import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertLeagueSchema, insertTeamSchema, insertUserSchema, insertDraftPickSchema, type Player } from "@shared/schema";
import { computeRotoStandings } from "./roto-scoring";

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

async function recalculateAdpForLeague(league: { type: string | null; scoringFormat: string | null; createdAt: Date | null }) {
  const leagueType = league.type || "Redraft";
  const scoringFormat = league.scoringFormat || "Roto";
  const season = league.createdAt ? new Date(league.createdAt).getFullYear() : 2026;
  await storage.recalculateAdp(leagueType, scoringFormat, season);
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Get public leagues
  app.get("/api/leagues/public", async (req, res) => {
    try {
      const leagues = await storage.getPublicLeagues();
      const leaguesWithTeamCount = await Promise.all(
        leagues.map(async (league) => {
          const teams = await storage.getTeamsByLeagueId(league.id);
          return { ...league, currentTeams: teams.length };
        })
      );
      res.json(leaguesWithTeamCount);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch public leagues" });
    }
  });

  // Get user teams
  app.get("/api/teams/user/:userId", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const teams = await storage.getTeamsByUserId(userId);
      res.json(teams);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch user teams" });
    }
  });

  // Get teams by league
  app.get("/api/teams/league/:leagueId", async (req, res) => {
    try {
      const leagueId = parseInt(req.params.leagueId);
      const teams = await storage.getTeamsByLeagueId(leagueId);
      res.json(teams);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch league teams" });
    }
  });

  // Get user activities
  app.get("/api/activities/user/:userId", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const activities = await storage.getActivitiesByUserId(userId);
      res.json(activities);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch user activities" });
    }
  });

  // Update league settings (commissioner only)
  app.patch("/api/leagues/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const league = await storage.getLeague(id);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }
      const { userId, ...updates } = req.body;
      if (league.createdBy !== userId) {
        return res.status(403).json({ message: "Only the commissioner can update league settings" });
      }
      const updated = await storage.updateLeague(id, updates);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to update league" });
    }
  });

  // Commissioner draft control (start/pause/resume)
  app.post("/api/leagues/:id/draft-control", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const league = await storage.getLeague(id);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }
      const { userId, action, fillWithCpu } = req.body;
      if (league.createdBy !== userId) {
        return res.status(403).json({ message: "Only the commissioner can control the draft" });
      }
      if (!["start", "pause", "resume"].includes(action)) {
        return res.status(400).json({ message: "Invalid action" });
      }

      if (action === "start" && fillWithCpu) {
        const existingTeams = await storage.getTeamsByLeagueId(id);
        const targetTeams = league.numberOfTeams || league.maxTeams || 12;
        const cpuNeeded = targetTeams - existingTeams.length;
        for (let i = 0; i < cpuNeeded; i++) {
          await storage.createTeam({
            name: `CPU Team ${existingTeams.length + i + 1}`,
            leagueId: id,
            userId: null,
            logo: null,
            nextOpponent: null,
            isCpu: true,
          });
        }
      }

      const newStatus = action === "pause" ? "paused" : "active";
      const updateData: Record<string, unknown> = { draftStatus: newStatus };
      if (newStatus === "active") {
        updateData.draftPickStartedAt = new Date().toISOString();
      } else {
        updateData.draftPickStartedAt = null;
      }
      const updated = await storage.updateLeague(id, updateData);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to update draft status" });
    }
  });

  app.delete("/api/leagues/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const league = await storage.getLeague(id);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }
      const { userId } = req.body;
      if (league.createdBy !== userId) {
        return res.status(403).json({ message: "Only the commissioner can delete the league" });
      }
      await storage.deleteLeague(id);
      res.json({ message: "League deleted" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete league" });
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
      res.status(500).json({ message: "Failed to fetch league" });
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

      const standings = computeRotoStandings(league, teams, draftPicks, playerMap, rosterPositions, "s26");
      res.json({
        standings,
        hittingCategories: league.hittingCategories || ["R", "HR", "RBI", "SB", "AVG"],
        pitchingCategories: league.pitchingCategories || ["W", "SV", "K", "ERA", "WHIP"],
        numTeams: teams.length,
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to compute standings" });
    }
  });

  // Search players
  app.get("/api/players", async (req, res) => {
    try {
      const query = req.query.q as string | undefined;
      const position = req.query.position as string | undefined;
      const mlbLevel = req.query.level as string | undefined;
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;
      const adpType = req.query.adpType as string | undefined;
      const adpScoring = req.query.adpScoring as string | undefined;
      const adpSeason = req.query.adpSeason ? parseInt(req.query.adpSeason as string) : undefined;
      const result = await storage.searchPlayers(query, position, mlbLevel, limit, offset, adpType, adpScoring, adpSeason);
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: "Failed to search players" });
    }
  });

  // Get player by ID
  app.get("/api/players/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const player = await storage.getPlayer(id);
      if (!player) {
        return res.status(404).json({ message: "Player not found" });
      }
      res.json(player);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch player" });
    }
  });

  // Get user profile
  app.get("/api/users/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const user = await storage.getUser(id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      res.json(user);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Create user (signup)
  app.post("/api/users", async (req, res) => {
    try {
      const validatedData = insertUserSchema.parse(req.body);
      const existingUser = await storage.getUserByUsername(validatedData.username);
      if (existingUser) {
        return res.status(400).json({ message: "Username already exists" });
      }
      const user = await storage.createUser(validatedData);
      res.status(201).json(user);
    } catch (error) {
      res.status(400).json({ message: "Invalid user data" });
    }
  });

  // Login user
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      const user = await storage.getUserByUsername(username);
      if (!user || user.password !== password) {
        return res.status(401).json({ message: "Invalid username or password" });
      }
      res.json(user);
    } catch (error) {
      res.status(500).json({ message: "Login failed" });
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
      const updated = await storage.updateUserPassword(user.id, newPassword);
      if (!updated) {
        return res.status(500).json({ message: "Failed to update password" });
      }
      res.json({ message: "Password updated successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to reset password" });
    }
  });

  // Create league
  app.post("/api/leagues", async (req, res) => {
    try {
      const validatedData = insertLeagueSchema.parse(req.body);
      const league = await storage.createLeague(validatedData);

      if (validatedData.createdBy) {
        const user = await storage.getUser(validatedData.createdBy);
        const teamName = user ? `${user.username}'s Team` : "My Team";
        await storage.createTeam({
          name: teamName,
          leagueId: league.id,
          userId: validatedData.createdBy,
          logo: "",
          nextOpponent: "",
        });
      }

      res.status(201).json(league);
    } catch (error) {
      res.status(400).json({ message: "Invalid league data" });
    }
  });

  // Create team
  app.post("/api/teams", async (req, res) => {
    try {
      const validatedData = insertTeamSchema.parse(req.body);
      const team = await storage.createTeam(validatedData);
      res.status(201).json(team);
    } catch (error) {
      res.status(400).json({ message: "Invalid team data" });
    }
  });

  // Join a public league
  app.post("/api/leagues/:id/join", async (req, res) => {
    try {
      const leagueId = parseInt(req.params.id);
      const { userId } = req.body;
      if (!userId) {
        return res.status(400).json({ message: "User ID is required" });
      }
      const league = await storage.getLeague(leagueId);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }
      if (!league.isPublic) {
        return res.status(403).json({ message: "This league is private" });
      }
      const existingTeams = await storage.getTeamsByLeagueId(leagueId);
      if (existingTeams.some(t => t.userId === userId)) {
        return res.status(400).json({ message: "You are already in this league" });
      }
      if (existingTeams.length >= (league.maxTeams || 12)) {
        return res.status(400).json({ message: "This league is full" });
      }
      const user = await storage.getUser(userId);
      const teamName = user ? `${user.username}'s Team` : "My Team";
      const team = await storage.createTeam({
        name: teamName,
        leagueId,
        userId,
        logo: "",
        nextOpponent: "",
      });
      res.status(201).json(team);
    } catch (error) {
      res.status(500).json({ message: "Failed to join league" });
    }
  });

  // Get draft picks for a league
  app.get("/api/leagues/:id/draft-picks", async (req, res) => {
    try {
      const leagueId = parseInt(req.params.id);
      const picks = await storage.getDraftPicksByLeague(leagueId);
      res.json(picks);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch draft picks" });
    }
  });

  // Make a draft pick
  app.post("/api/leagues/:id/draft-picks", async (req, res) => {
    try {
      const leagueId = parseInt(req.params.id);
      const league = await storage.getLeague(leagueId);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }
      if (league.draftStatus !== "active") {
        return res.status(400).json({ message: "Draft is not active" });
      }

      const { userId, playerId } = req.body;
      if (!userId || !playerId) {
        return res.status(400).json({ message: "userId and playerId are required" });
      }

      const leagueTeams = await storage.getTeamsByLeagueId(leagueId);
      const userTeam = leagueTeams.find(t => t.userId === userId);
      if (!userTeam) {
        return res.status(403).json({ message: "You don't have a team in this league" });
      }

      const existingPicks = await storage.getDraftPicksByLeague(leagueId);
      const totalRounds = (league.rosterPositions || []).length;
      const numTeams = leagueTeams.length;

      const nextOverall = existingPicks.length + 1;
      if (nextOverall > totalRounds * numTeams) {
        return res.status(400).json({ message: "Draft is complete" });
      }

      const round = Math.ceil(nextOverall / numTeams);
      const pickInRound = ((nextOverall - 1) % numTeams) + 1;
      const isEvenRound = round % 2 === 1;
      const teamIndex = isEvenRound ? pickInRound - 1 : numTeams - pickInRound;
      const expectedTeam = leagueTeams[teamIndex];

      if (!expectedTeam || expectedTeam.id !== userTeam.id) {
        return res.status(403).json({ message: "It's not your turn to pick" });
      }

      const alreadyDrafted = existingPicks.some(p => p.playerId === playerId);
      if (alreadyDrafted) {
        return res.status(400).json({ message: "Player already drafted" });
      }

      const player = await storage.getPlayer(playerId);
      if (!player) {
        return res.status(404).json({ message: "Player not found" });
      }

      const rosterPositions = league.rosterPositions || [];
      const teamPicks = existingPicks.filter(p => p.teamId === userTeam.id);
      const teamPlayers: { position: string }[] = [];
      for (const tp of teamPicks) {
        const pl = await storage.getPlayer(tp.playerId);
        if (pl) teamPlayers.push({ position: pl.position });
      }

      const filledSlots = new Set<number>();
      for (const tp of teamPlayers) {
        const idx = rosterPositions.findIndex((slot, i) => {
          if (filledSlots.has(i)) return false;
          if (slot === tp.position) return true;
          if (slot === "OF" && ["OF", "LF", "CF", "RF"].includes(tp.position)) return true;
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

      const canFitPlayer = (playerPos: string): boolean => {
        for (let i = 0; i < rosterPositions.length; i++) {
          if (filledSlots.has(i)) continue;
          const slot = rosterPositions[i];
          if (slot === "BN" || slot === "IL") return true;
          if (slot === "UT" && !["SP", "RP"].includes(playerPos)) return true;
          if (slot === "P" && ["SP", "RP"].includes(playerPos)) return true;
          if (slot === "OF" && ["OF", "LF", "CF", "RF"].includes(playerPos)) return true;
          if (slot === playerPos) return true;
        }
        return false;
      };

      if (!canFitPlayer(player.position)) {
        return res.status(400).json({ message: `No open roster slot for ${player.position}. You can only draft players at positions you have unfilled.` });
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
        recalculateAdpForLeague(league).catch(e => console.error("ADP recalc error:", e));
      } else {
        await storage.updateLeague(leagueId, { draftPickStartedAt: new Date().toISOString() });
      }

      res.status(201).json(pick);
    } catch (error) {
      res.status(500).json({ message: "Failed to make draft pick" });
    }
  });

  // Commissioner assign: commissioner picks a player for the current pick
  app.post("/api/leagues/:id/commissioner-pick", async (req, res) => {
    try {
      const leagueId = parseInt(req.params.id);
      const league = await storage.getLeague(leagueId);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }
      if (league.draftStatus !== "active" && league.draftStatus !== "paused") {
        return res.status(400).json({ message: "Draft is not active or paused" });
      }

      const { commissionerId, playerId, targetOverall } = req.body;
      if (!commissionerId || !playerId) {
        return res.status(400).json({ message: "commissionerId and playerId are required" });
      }
      if (league.createdBy !== commissionerId) {
        return res.status(403).json({ message: "Only the commissioner can assign players" });
      }

      const leagueTeams = await storage.getTeamsByLeagueId(leagueId);
      const existingPicks = await storage.getDraftPicksByLeague(leagueId);
      const totalRounds = (league.rosterPositions || []).length;
      const numTeams = leagueTeams.length;

      const existingPickForSlot = targetOverall ? existingPicks.find(p => p.overallPick === targetOverall) : null;

      if (existingPickForSlot) {
        const alreadyDrafted = existingPicks.some(p => p.playerId === playerId && p.overallPick !== targetOverall);
        if (alreadyDrafted) {
          return res.status(400).json({ message: "Player already drafted in another slot" });
        }

        const pick = await storage.updateDraftPickPlayer(leagueId, targetOverall, playerId);
        return res.status(200).json(pick);
      }

      const nextOverall = existingPicks.length + 1;
      if (nextOverall > totalRounds * numTeams) {
        return res.status(400).json({ message: "Draft is complete" });
      }

      const round = Math.ceil(nextOverall / numTeams);
      const pickInRound = ((nextOverall - 1) % numTeams) + 1;
      const isEvenRound = round % 2 === 1;
      const teamIndex = isEvenRound ? pickInRound - 1 : numTeams - pickInRound;
      const expectedTeam = leagueTeams[teamIndex];

      if (!expectedTeam) {
        return res.status(400).json({ message: "Cannot determine team for this pick" });
      }

      const alreadyDrafted = existingPicks.some(p => p.playerId === playerId);
      if (alreadyDrafted) {
        return res.status(400).json({ message: "Player already drafted" });
      }

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
        recalculateAdpForLeague(league).catch(e => console.error("ADP recalc error:", e));
      } else {
        await storage.updateLeague(leagueId, { draftPickStartedAt: new Date().toISOString() });
      }

      res.status(201).json(pick);
    } catch (error) {
      res.status(500).json({ message: "Failed to make commissioner pick" });
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

      const leagueTeams = await storage.getTeamsByLeagueId(leagueId);
      const existingPicks = await storage.getDraftPicksByLeague(leagueId);
      const rosterPositions = league.rosterPositions || [];
      const totalRounds = rosterPositions.length;
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

      const filledSlots = new Set<number>();
      for (const tp of teamPlayers) {
        const idx = rosterPositions.findIndex((slot, i) => {
          if (filledSlots.has(i)) return false;
          if (slot === tp.position) return true;
          if (slot === "OF" && ["OF", "LF", "CF", "RF"].includes(tp.position)) return true;
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

      const eligiblePositions: string[] = [];
      for (const slot of emptySlotPositions) {
        if (slot === "BN" || slot === "IL") continue;
        if (slot === "UT") continue;
        if (slot === "P") continue;
        if (!eligiblePositions.includes(slot)) eligiblePositions.push(slot);
      }

      if (hasUtil) {
        for (const p of ["C", "1B", "2B", "3B", "SS", "OF", "DH"]) {
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

      const leagueType = league.type || "Redraft";
      const scoringFormat = league.scoringFormat || "Roto";
      const season = new Date().getFullYear();

      let selectedPlayer = await storage.getBestAvailableByAdp(
        draftedPlayerIds, leagueType, scoringFormat, season, eligiblePositions
      );

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
        recalculateAdpForLeague(league).catch(e => console.error("ADP recalc error:", e));
      } else {
        await storage.updateLeague(leagueId, { draftPickStartedAt: new Date().toISOString() });
      }

      res.status(201).json({ pick, player: selectedPlayer });
    } catch (error) {
      res.status(500).json({ message: "Failed to auto-pick" });
    }
  });

  // Swap roster slots (substitute players)
  app.post("/api/leagues/:id/roster-swap", async (req, res) => {
    try {
      const leagueId = parseInt(req.params.id);
      const { userId, pickIdA, slotA, pickIdB, slotB } = req.body;
      if (!userId || pickIdA === undefined || slotA === undefined || slotB === undefined) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      const league = await storage.getLeague(leagueId);
      if (!league) return res.status(404).json({ message: "League not found" });

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

      const canFit = (playerPos: string, slotPos: string): boolean => {
        if (slotPos === "BN" || slotPos === "IL") return true;
        if (slotPos === "UT") return !["SP", "RP"].includes(playerPos);
        if (slotPos === "P") return ["SP", "RP"].includes(playerPos);
        if (slotPos === "OF") return ["OF", "LF", "CF", "RF"].includes(playerPos);
        return playerPos === slotPos;
      };

      if (!canFit(playerA.position, targetSlotPos)) {
        return res.status(400).json({ message: `${playerA.name} (${playerA.position}) cannot play ${targetSlotPos}` });
      }

      if (pickIdB !== null && pickIdB !== undefined) {
        const pickB = await storage.getDraftPickById(pickIdB);
        if (!pickB || pickB.teamId !== userTeam.id || pickB.leagueId !== leagueId) {
          return res.status(403).json({ message: "Invalid target pick" });
        }
        const playerB = await storage.getPlayer(pickB.playerId);
        if (!playerB) return res.status(404).json({ message: "Target player not found" });

        if (!canFit(playerB.position, sourceSlotPos)) {
          return res.status(400).json({ message: `${playerB.name} (${playerB.position}) cannot play ${sourceSlotPos}` });
        }

        await storage.swapRosterSlots(leagueId, userTeam.id, pickIdA, slotA, pickIdB, slotB);
      } else {
        await storage.swapRosterSlots(leagueId, userTeam.id, pickIdA, slotA, null, slotB);
      }

      res.json({ message: "Roster swap successful" });
    } catch (error) {
      res.status(500).json({ message: "Failed to swap roster slots" });
    }
  });

  // Initialize roster slots after draft completes
  app.post("/api/leagues/:id/init-roster-slots", async (req, res) => {
    try {
      const leagueId = parseInt(req.params.id);
      const { userId } = req.body;
      if (!userId) return res.status(400).json({ message: "userId is required" });

      const league = await storage.getLeague(leagueId);
      if (!league) return res.status(404).json({ message: "League not found" });

      const leagueTeams = await storage.getTeamsByLeagueId(leagueId);
      const userTeam = leagueTeams.find(t => t.userId === userId);
      if (!userTeam) return res.status(403).json({ message: "No team in this league" });

      const picks = await storage.getDraftPicksByLeague(leagueId);
      const myPicks = picks.filter(p => p.teamId === userTeam.id);

      const alreadyInitialized = myPicks.some(p => p.rosterSlot !== null);
      if (alreadyInitialized) {
        return res.json({ message: "Already initialized" });
      }

      const rosterPositions = league.rosterPositions || [];
      const playerObjects: (Player | undefined)[] = await Promise.all(
        myPicks.map(p => storage.getPlayer(p.playerId))
      );

      const canFitSlot = (playerPos: string, slotPos: string): boolean => {
        if (slotPos === "BN" || slotPos === "IL") return true;
        if (slotPos === "UT") return !["SP", "RP"].includes(playerPos);
        if (slotPos === "P") return ["SP", "RP"].includes(playerPos);
        if (slotPos === "OF") return ["OF", "LF", "CF", "RF"].includes(playerPos);
        return playerPos === slotPos;
      };

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
              if (slot === player.position || (slot === "OF" && ["OF", "LF", "CF", "RF"].includes(player.position))) {
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
      res.status(500).json({ message: "Failed to initialize roster slots" });
    }
  });

  // Get drafted player IDs for a league (for filtering available players)
  app.get("/api/leagues/:id/drafted-player-ids", async (req, res) => {
    try {
      const leagueId = parseInt(req.params.id);
      const playerIds = await storage.getDraftedPlayerIds(leagueId);
      res.json(playerIds);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch drafted player IDs" });
    }
  });

  app.get("/api/adp", async (req, res) => {
    try {
      const leagueType = (req.query.type as string) || "Redraft";
      const scoringFormat = (req.query.scoring as string) || "Roto";
      const season = parseInt(req.query.season as string) || 2026;
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;
      const result = await storage.getAdp(leagueType, scoringFormat, season, limit, offset);
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch ADP data" });
    }
  });

  app.get("/api/adp/player/:playerId", async (req, res) => {
    try {
      const playerId = parseInt(req.params.playerId);
      const leagueType = (req.query.type as string) || "Redraft";
      const scoringFormat = (req.query.scoring as string) || "Roto";
      const season = parseInt(req.query.season as string) || 2026;
      const record = await storage.getPlayerAdp(playerId, leagueType, scoringFormat, season);
      if (!record) {
        return res.status(404).json({ message: "No ADP data for this player" });
      }
      res.json(record);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch player ADP" });
    }
  });

  app.post("/api/adp/recalculate", async (req, res) => {
    try {
      const leagueType = (req.body.type as string) || "Redraft";
      const scoringFormat = (req.body.scoring as string) || "Roto";
      const season = parseInt(req.body.season) || 2026;
      await storage.recalculateAdp(leagueType, scoringFormat, season);
      res.json({ message: "ADP recalculated successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to recalculate ADP" });
    }
  });

  app.get("/api/leagues/:id/available-players", async (req, res) => {
    try {
      const leagueId = parseInt(req.params.id);
      const query = req.query.q as string | undefined;
      const position = req.query.position as string | undefined;
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;
      const playerType = req.query.type as string | undefined;
      const rosterStatus = req.query.status as string | undefined;
      const result = await storage.searchAvailablePlayers(leagueId, query, position, limit, offset, playerType, rosterStatus);
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch available players" });
    }
  });

  app.post("/api/leagues/:id/add-player", async (req, res) => {
    try {
      const leagueId = parseInt(req.params.id);
      const { userId, playerId } = req.body;
      if (!userId || !playerId) return res.status(400).json({ message: "Missing required fields" });

      const league = await storage.getLeague(leagueId);
      if (!league) return res.status(404).json({ message: "League not found" });

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
      res.json({ pick, player });
    } catch (error) {
      res.status(500).json({ message: "Failed to add player" });
    }
  });

  app.post("/api/leagues/:id/add-drop", async (req, res) => {
    try {
      const leagueId = parseInt(req.params.id);
      const { userId, addPlayerId, dropPickId } = req.body;
      if (!userId || !addPlayerId || !dropPickId) return res.status(400).json({ message: "Missing required fields" });

      const league = await storage.getLeague(leagueId);
      if (!league) return res.status(404).json({ message: "League not found" });

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
      res.json({ pick, player, message: "Player added and dropped successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to add/drop player" });
    }
  });

  app.post("/api/leagues/:id/drop-player", async (req, res) => {
    try {
      const leagueId = parseInt(req.params.id);
      const { userId, pickId } = req.body;
      if (!userId || !pickId) return res.status(400).json({ message: "Missing required fields" });

      const league = await storage.getLeague(leagueId);
      if (!league) return res.status(404).json({ message: "League not found" });

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

      res.json({ message: "Player dropped successfully — on waivers for 2 days" });
    } catch (error) {
      res.status(500).json({ message: "Failed to drop player" });
    }
  });

  app.get("/api/leagues/:id/waivers", async (req, res) => {
    try {
      const leagueId = parseInt(req.params.id);
      const activeWaivers = await storage.getActiveWaiversByLeague(leagueId);
      const waiversWithPlayers = await Promise.all(activeWaivers.map(async (w) => {
        const player = await storage.getPlayer(w.playerId);
        const claims = await storage.getClaimsForWaiver(w.id);
        return { ...w, player, claimCount: claims.length };
      }));
      res.json(waiversWithPlayers);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch waivers" });
    }
  });

  app.get("/api/leagues/:id/my-claims", async (req, res) => {
    try {
      const leagueId = parseInt(req.params.id);
      const userId = parseInt(req.query.userId as string);
      if (!userId) return res.status(400).json({ message: "Missing userId" });

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
      res.status(500).json({ message: "Failed to fetch claims" });
    }
  });

  app.post("/api/leagues/:id/waiver-claim", async (req, res) => {
    try {
      const leagueId = parseInt(req.params.id);
      const { userId, playerId, dropPickId } = req.body;
      if (!userId || !playerId) return res.status(400).json({ message: "Missing required fields" });

      const league = await storage.getLeague(leagueId);
      if (!league) return res.status(404).json({ message: "League not found" });

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
      const hasOpenSlot = myPicks.length < rosterPositions.length;

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
      res.status(500).json({ message: "Failed to submit waiver claim" });
    }
  });

  app.delete("/api/leagues/:id/waiver-claim/:claimId", async (req, res) => {
    try {
      const leagueId = parseInt(req.params.id);
      const claimId = parseInt(req.params.claimId);
      const userId = parseInt(req.query.userId as string);
      if (!userId) return res.status(400).json({ message: "Missing userId" });

      const leagueTeams = await storage.getTeamsByLeagueId(leagueId);
      const userTeam = leagueTeams.find(t => t.userId === userId);
      if (!userTeam) return res.status(403).json({ message: "You don't have a team in this league" });

      const claims = await storage.getClaimsByTeam(userTeam.id);
      const claim = claims.find(c => c.id === claimId);
      if (!claim) return res.status(404).json({ message: "Claim not found" });

      await storage.deleteWaiverClaim(claimId);
      res.json({ message: "Waiver claim cancelled" });
    } catch (error) {
      res.status(500).json({ message: "Failed to cancel waiver claim" });
    }
  });

  app.post("/api/import-stats", async (req, res) => {
    try {
      const { importSeasonStats } = await import("./import-stats");
      const season = req.body.season ? parseInt(req.body.season) : undefined;
      res.json({ message: `Stats import started for season ${season || 2025}` });
      importSeasonStats(season).then(result => {
        console.log("Stats import finished:", result);
      }).catch(e => console.error("Stats import error:", e));
    } catch (error) {
      console.error("Import stats error:", error);
      res.status(500).json({ message: "Failed to start stats import" });
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

      if (lineup.length === 0) {
        const league = await storage.getLeague(leagueId);
        if (!league) return res.status(404).json({ message: "League not found" });
        const rosterPositions = league.rosterPositions || [];

        const dates = await storage.getDailyLineupDates(leagueId, teamId);
        const previousDate = dates.find(d => d < date);

        if (previousDate) {
          const prevLineup = await storage.getDailyLineup(leagueId, teamId, previousDate);
          const entries = prevLineup.map(e => ({
            leagueId,
            teamId,
            date,
            slotIndex: e.slotIndex,
            slotPos: e.slotPos,
            playerId: e.playerId,
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
            return {
              leagueId,
              teamId,
              date,
              slotIndex: idx,
              slotPos: pos,
              playerId: pick ? pick.playerId : null,
            };
          });
          if (entries.length > 0) {
            await storage.saveDailyLineup(entries);
            lineup = await storage.getDailyLineup(leagueId, teamId, date);
          }
        }
      }

      res.json(lineup);
    } catch (error) {
      console.error("Get daily lineup error:", error);
      res.status(500).json({ message: "Failed to fetch daily lineup" });
    }
  });

  app.post("/api/leagues/:id/daily-lineup/swap", async (req, res) => {
    try {
      const leagueId = parseInt(req.params.id);
      const { teamId, date, slotIndexA, slotIndexB } = req.body;
      if (!teamId || !date || slotIndexA === undefined || slotIndexB === undefined) {
        return res.status(400).json({ message: "teamId, date, slotIndexA, slotIndexB required" });
      }

      const today = new Date().toISOString().split("T")[0];
      if (date < today) {
        return res.status(400).json({ message: "Cannot modify past lineups" });
      }

      const lineup = await storage.getDailyLineup(leagueId, teamId, date);
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

      await storage.deleteDailyLineup(leagueId, teamId, date);
      await storage.saveDailyLineup(applySwapToLineup(lineup, date));

      const futureDates = await storage.getFutureDailyLineupDates(leagueId, teamId, date);
      for (const futureDate of futureDates) {
        const futureLineup = await storage.getDailyLineup(leagueId, teamId, futureDate);
        const futureA = futureLineup.find(e => e.slotIndex === slotIndexA);
        const futureB = futureLineup.find(e => e.slotIndex === slotIndexB);
        if (futureA && futureB && futureA.playerId === playerIdA && futureB.playerId === playerIdB) {
          await storage.deleteDailyLineup(leagueId, teamId, futureDate);
          await storage.saveDailyLineup(applySwapToLineup(futureLineup, futureDate));
        }
      }

      const newLineup = await storage.getDailyLineup(leagueId, teamId, date);
      res.json(newLineup);
    } catch (error) {
      console.error("Daily lineup swap error:", error);
      res.status(500).json({ message: "Failed to swap daily lineup" });
    }
  });

  const httpServer = createServer(app);

  async function checkExpiredDraftPicks() {
    try {
      const activeLeagues = await storage.getActiveDraftLeagues();
      for (const league of activeLeagues) {
        if (!league.draftPickStartedAt) continue;
        const secondsPerPick = league.secondsPerPick || 60;

        const leagueTeams = await storage.getTeamsByLeagueId(league.id);
        const existingPicks = await storage.getDraftPicksByLeague(league.id);
        const rosterPositions = league.rosterPositions || [];
        const totalRounds = rosterPositions.length;
        const numTeams = leagueTeams.length;
        if (numTeams === 0) continue;

        const nextOverall = existingPicks.length + 1;
        if (nextOverall > totalRounds * numTeams) {
          await storage.updateLeague(league.id, { draftStatus: "completed", draftPickStartedAt: null });
          recalculateAdpForLeague(league).catch(e => console.error("ADP recalc error:", e));
          continue;
        }

        const round = Math.ceil(nextOverall / numTeams);
        const pickInRound = ((nextOverall - 1) % numTeams) + 1;
        const isEvenRound = round % 2 === 1;
        const teamIndex = isEvenRound ? pickInRound - 1 : numTeams - pickInRound;
        const pickingTeam = leagueTeams[teamIndex];
        if (!pickingTeam) continue;

        const isCpuTeam = pickingTeam.isCpu === true;
        if (!isCpuTeam) {
          const startedAt = new Date(league.draftPickStartedAt!).getTime();
          const elapsed = (Date.now() - startedAt) / 1000;
          if (elapsed < secondsPerPick) continue;
        }

        const draftedPlayerIds = await storage.getDraftedPlayerIds(league.id);
        const teamPicks = existingPicks.filter(p => p.teamId === pickingTeam.id);
        const teamPlayerIds = teamPicks.map(p => p.playerId);

        const teamPlayers: { position: string }[] = [];
        for (const pid of teamPlayerIds) {
          const pl = await storage.getPlayer(pid);
          if (pl) teamPlayers.push({ position: pl.position });
        }

        const filledSlots = new Set<number>();
        for (const tp of teamPlayers) {
          const idx = rosterPositions.findIndex((slot, i) => {
            if (filledSlots.has(i)) return false;
            if (slot === tp.position) return true;
            if (slot === "OF" && ["OF", "LF", "CF", "RF"].includes(tp.position)) return true;
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

        const priorityOrder = ["C", "1B", "2B", "3B", "SS", "OF", "SP", "RP", "P", "DH", "UT", "BN", "IL"];
        emptySlotPositions.sort((a, b) => {
          const ai = priorityOrder.indexOf(a);
          const bi = priorityOrder.indexOf(b);
          return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
        });

        let selectedPlayer = null;
        for (const slotPos of emptySlotPositions) {
          if (slotPos === "BN" || slotPos === "IL" || slotPos === "UT" || slotPos === "P") continue;
          selectedPlayer = await storage.getBestAvailablePlayer(draftedPlayerIds, slotPos);
          if (selectedPlayer) break;
        }
        if (!selectedPlayer) {
          selectedPlayer = await storage.getBestAvailablePlayer(draftedPlayerIds);
        }
        if (!selectedPlayer) {
          await storage.updateLeague(league.id, { draftStatus: "completed", draftPickStartedAt: null });
          recalculateAdpForLeague(league).catch(e => console.error("ADP recalc error:", e));
          continue;
        }

        await storage.createDraftPick({
          leagueId: league.id,
          teamId: pickingTeam.id,
          playerId: selectedPlayer.id,
          overallPick: nextOverall,
          round,
          pickInRound,
        });

        const totalPicks = totalRounds * numTeams;
        if (nextOverall >= totalPicks) {
          await storage.updateLeague(league.id, { draftStatus: "completed", draftPickStartedAt: null });
          recalculateAdpForLeague(league).catch(e => console.error("ADP recalc error:", e));
        } else {
          await storage.updateLeague(league.id, { draftPickStartedAt: new Date().toISOString() });
        }
      }
    } catch (error) {
      console.error("Error checking expired draft picks:", error);
    }
  }

  setInterval(checkExpiredDraftPicks, 5000);

  async function processExpiredWaivers() {
    try {
      const expiredWaivers = await storage.getExpiredWaivers();
      for (const waiver of expiredWaivers) {
        const claims = await storage.getClaimsForWaiver(waiver.id);
        if (claims.length > 0) {
          const winningClaim = claims[0];
          if (winningClaim.dropPickId) {
            const dropPick = await storage.getDraftPickById(winningClaim.dropPickId);
            if (dropPick) {
              const rosterSlot = dropPick.rosterSlot ?? 0;
              await storage.dropPlayerFromTeam(winningClaim.dropPickId);
              await storage.addPlayerToTeam(waiver.leagueId, winningClaim.teamId, waiver.playerId, rosterSlot);
            }
          } else {
            const rosterPositions = (await storage.getLeague(waiver.leagueId))?.rosterPositions || [];
            const benchIndex = rosterPositions.findIndex(s => s === "BN");
            const rosterSlot = benchIndex !== -1 ? benchIndex : rosterPositions.length - 1;
            await storage.addPlayerToTeam(waiver.leagueId, winningClaim.teamId, waiver.playerId, rosterSlot);
          }
          await storage.completeWaiver(waiver.id, "claimed");
        } else {
          await storage.completeWaiver(waiver.id, "cleared");
        }
      }
    } catch (error) {
      console.error("Error processing expired waivers:", error);
    }
  }

  setInterval(processExpiredWaivers, 60000);

  return httpServer;
}
