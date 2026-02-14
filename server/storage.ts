import { 
  users, leagues, teams, players, activities, draftPicks,
  type User, type InsertUser,
  type League, type InsertLeague,
  type Team, type InsertTeam,
  type Player, type InsertPlayer,
  type DraftPick, type InsertDraftPick,
  type Activity, type InsertActivity
} from "@shared/schema";
import { db } from "./db";
import { eq, ilike, or, and, sql, notInArray, asc } from "drizzle-orm";

export interface IStorage {
  // Users
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  updateUserPassword(id: number, password: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Leagues
  getLeagues(): Promise<League[]>;
  getPublicLeagues(): Promise<League[]>;
  getLeague(id: number): Promise<League | undefined>;
  createLeague(league: InsertLeague): Promise<League>;
  updateLeague(id: number, data: Partial<InsertLeague>): Promise<League | undefined>;
  
  // Teams
  getTeamsByUserId(userId: number): Promise<Team[]>;
  getTeamsByLeagueId(leagueId: number): Promise<Team[]>;
  getTeam(id: number): Promise<Team | undefined>;
  createTeam(team: InsertTeam): Promise<Team>;
  
  // Players
  getPlayers(): Promise<Player[]>;
  getPlayer(id: number): Promise<Player | undefined>;
  searchPlayers(query?: string, position?: string, mlbLevel?: string, limit?: number, offset?: number): Promise<{ players: Player[]; total: number }>;
  createPlayer(player: InsertPlayer): Promise<Player>;
  
  // Draft Picks
  getDraftPicksByLeague(leagueId: number): Promise<DraftPick[]>;
  createDraftPick(pick: InsertDraftPick): Promise<DraftPick>;
  getDraftedPlayerIds(leagueId: number): Promise<number[]>;

  // Activities
  getActivitiesByUserId(userId: number): Promise<Activity[]>;
  createActivity(activity: InsertActivity): Promise<Activity>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user || undefined;
  }

  async updateUserPassword(id: number, password: string): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({ password })
      .where(eq(users.id, id))
      .returning();
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(insertUser)
      .returning();
    return user;
  }

  async getLeagues(): Promise<League[]> {
    return await db.select().from(leagues);
  }

  async getPublicLeagues(): Promise<League[]> {
    return await db.select().from(leagues).where(eq(leagues.isPublic, true));
  }

  async getLeague(id: number): Promise<League | undefined> {
    const [league] = await db.select().from(leagues).where(eq(leagues.id, id));
    return league || undefined;
  }

  async createLeague(insertLeague: InsertLeague): Promise<League> {
    const [league] = await db
      .insert(leagues)
      .values(insertLeague)
      .returning();
    return league;
  }

  async updateLeague(id: number, data: Partial<InsertLeague>): Promise<League | undefined> {
    const [league] = await db
      .update(leagues)
      .set(data)
      .where(eq(leagues.id, id))
      .returning();
    return league || undefined;
  }

  async getTeamsByUserId(userId: number): Promise<Team[]> {
    return await db.select().from(teams).where(eq(teams.userId, userId));
  }

  async getTeamsByLeagueId(leagueId: number): Promise<Team[]> {
    return await db.select().from(teams).where(eq(teams.leagueId, leagueId));
  }

  async getTeam(id: number): Promise<Team | undefined> {
    const [team] = await db.select().from(teams).where(eq(teams.id, id));
    return team || undefined;
  }

  async createTeam(insertTeam: InsertTeam): Promise<Team> {
    const [team] = await db
      .insert(teams)
      .values(insertTeam)
      .returning();
    return team;
  }

  async getPlayers(): Promise<Player[]> {
    return await db.select().from(players);
  }

  async getPlayer(id: number): Promise<Player | undefined> {
    const [player] = await db.select().from(players).where(eq(players.id, id));
    return player || undefined;
  }

  async searchPlayers(query?: string, position?: string, mlbLevel?: string, limit = 50, offset = 0): Promise<{ players: Player[]; total: number }> {
    const conditions = [];
    if (query) {
      conditions.push(ilike(players.name, `%${query}%`));
    }
    if (position && position !== "ALL") {
      conditions.push(eq(players.position, position));
    }
    if (mlbLevel && mlbLevel !== "ALL") {
      conditions.push(eq(players.mlbLevel, mlbLevel));
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [countResult] = await db.select({ count: sql<number>`count(*)` }).from(players).where(where);
    const total = Number(countResult.count);

    const result = await db.select().from(players).where(where).orderBy(players.name).limit(limit).offset(offset);

    return { players: result, total };
  }

  async createPlayer(insertPlayer: InsertPlayer): Promise<Player> {
    const [player] = await db
      .insert(players)
      .values(insertPlayer)
      .returning();
    return player;
  }

  async getDraftPicksByLeague(leagueId: number): Promise<DraftPick[]> {
    return await db.select().from(draftPicks)
      .where(eq(draftPicks.leagueId, leagueId))
      .orderBy(asc(draftPicks.overallPick));
  }

  async createDraftPick(pick: InsertDraftPick): Promise<DraftPick> {
    const [draftPick] = await db
      .insert(draftPicks)
      .values(pick)
      .returning();
    return draftPick;
  }

  async getDraftedPlayerIds(leagueId: number): Promise<number[]> {
    const picks = await db.select({ playerId: draftPicks.playerId })
      .from(draftPicks)
      .where(eq(draftPicks.leagueId, leagueId));
    return picks.map(p => p.playerId);
  }

  async getActivitiesByUserId(userId: number): Promise<Activity[]> {
    return await db.select().from(activities).where(eq(activities.userId, userId));
  }

  async createActivity(insertActivity: InsertActivity): Promise<Activity> {
    const [activity] = await db
      .insert(activities)
      .values(insertActivity)
      .returning();
    return activity;
  }
}

export const storage = new DatabaseStorage();
