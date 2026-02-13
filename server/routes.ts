import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertLeagueSchema, insertTeamSchema, insertUserSchema } from "@shared/schema";

export async function registerRoutes(app: Express): Promise<Server> {
  // Get public leagues
  app.get("/api/leagues/public", async (req, res) => {
    try {
      const leagues = await storage.getPublicLeagues();
      res.json(leagues);
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

  const httpServer = createServer(app);
  return httpServer;
}
