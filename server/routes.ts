import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertLeagueSchema, insertTeamSchema, insertUserSchema, insertDraftPickSchema } from "@shared/schema";

async function recalculateAdpForLeague(league: { type: string | null; scoringFormat: string | null; createdAt: Date | null }) {
  const leagueType = league.type || "Redraft";
  const scoringFormat = league.scoringFormat || "5x5 Roto";
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
            const utilIdx = rosterPositions.findIndex((s, i) => !filledSlots.has(i) && s === "UTIL");
            if (utilIdx !== -1) filledSlots.add(utilIdx);
            else {
              const bnIdx = rosterPositions.findIndex((s, i) => !filledSlots.has(i) && s === "BN");
              if (bnIdx !== -1) filledSlots.add(bnIdx);
            }
          } else {
            const bnIdx = rosterPositions.findIndex((s, i) => !filledSlots.has(i) && s === "BN");
            if (bnIdx !== -1) filledSlots.add(bnIdx);
          }
        }
      }

      const emptySlotPositions: string[] = [];
      for (let i = 0; i < rosterPositions.length; i++) {
        if (!filledSlots.has(i)) {
          emptySlotPositions.push(rosterPositions[i]);
        }
      }

      const priorityOrder = ["C", "1B", "2B", "3B", "SS", "OF", "SP", "RP", "DH", "UTIL", "BN", "IL"];
      emptySlotPositions.sort((a, b) => {
        const ai = priorityOrder.indexOf(a);
        const bi = priorityOrder.indexOf(b);
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      });

      let selectedPlayer = null;
      for (const slotPos of emptySlotPositions) {
        if (slotPos === "BN" || slotPos === "IL" || slotPos === "UTIL") continue;
        selectedPlayer = await storage.getBestAvailablePlayer(draftedPlayerIds, slotPos);
        if (selectedPlayer) break;
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
        recalculateAdpForLeague(league).catch(e => console.error("ADP recalc error:", e));
      } else {
        await storage.updateLeague(leagueId, { draftPickStartedAt: new Date().toISOString() });
      }

      res.status(201).json({ pick, player: selectedPlayer });
    } catch (error) {
      res.status(500).json({ message: "Failed to auto-pick" });
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
      const scoringFormat = (req.query.scoring as string) || "5x5 Roto";
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
      const scoringFormat = (req.query.scoring as string) || "5x5 Roto";
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
      const scoringFormat = (req.body.scoring as string) || "5x5 Roto";
      const season = parseInt(req.body.season) || 2026;
      await storage.recalculateAdp(leagueType, scoringFormat, season);
      res.json({ message: "ADP recalculated successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to recalculate ADP" });
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
              const utilIdx = rosterPositions.findIndex((s, i) => !filledSlots.has(i) && s === "UTIL");
              if (utilIdx !== -1) filledSlots.add(utilIdx);
              else {
                const bnIdx = rosterPositions.findIndex((s, i) => !filledSlots.has(i) && s === "BN");
                if (bnIdx !== -1) filledSlots.add(bnIdx);
              }
            } else {
              const bnIdx = rosterPositions.findIndex((s, i) => !filledSlots.has(i) && s === "BN");
              if (bnIdx !== -1) filledSlots.add(bnIdx);
            }
          }
        }

        const emptySlotPositions: string[] = [];
        for (let i = 0; i < rosterPositions.length; i++) {
          if (!filledSlots.has(i)) emptySlotPositions.push(rosterPositions[i]);
        }

        const priorityOrder = ["C", "1B", "2B", "3B", "SS", "OF", "SP", "RP", "DH", "UTIL", "BN", "IL"];
        emptySlotPositions.sort((a, b) => {
          const ai = priorityOrder.indexOf(a);
          const bi = priorityOrder.indexOf(b);
          return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
        });

        let selectedPlayer = null;
        for (const slotPos of emptySlotPositions) {
          if (slotPos === "BN" || slotPos === "IL" || slotPos === "UTIL") continue;
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

  return httpServer;
}
