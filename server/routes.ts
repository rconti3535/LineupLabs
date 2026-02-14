import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertLeagueSchema, insertTeamSchema, insertUserSchema, insertDraftPickSchema } from "@shared/schema";

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
      const { userId, action } = req.body;
      if (league.createdBy !== userId) {
        return res.status(403).json({ message: "Only the commissioner can control the draft" });
      }
      if (!["start", "pause", "resume"].includes(action)) {
        return res.status(400).json({ message: "Invalid action" });
      }
      const newStatus = action === "pause" ? "paused" : "active";
      const updated = await storage.updateLeague(id, { draftStatus: newStatus });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to update draft status" });
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
      const result = await storage.searchPlayers(query, position, mlbLevel, limit, offset);
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
      res.status(201).json(pick);
    } catch (error) {
      res.status(500).json({ message: "Failed to make draft pick" });
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

  const httpServer = createServer(app);
  return httpServer;
}
