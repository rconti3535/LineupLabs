import { 
  users, leagues, teams, players, activities, draftPicks, playerAdp,
  type User, type InsertUser,
  type League, type InsertLeague,
  type Team, type InsertTeam,
  type Player, type InsertPlayer,
  type DraftPick, type InsertDraftPick,
  type PlayerAdp, type InsertPlayerAdp,
  type Activity, type InsertActivity
} from "@shared/schema";
import { db } from "./db";
import { eq, ilike, or, and, sql, notInArray, asc, desc, inArray } from "drizzle-orm";

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
  getBestAvailablePlayer(excludeIds: number[], position?: string): Promise<Player | undefined>;

  // ADP
  recalculateAdp(leagueType: string, scoringFormat: string, season: number): Promise<void>;
  getAdp(leagueType: string, scoringFormat: string, season: number, limit?: number, offset?: number): Promise<{ adpRecords: PlayerAdp[]; total: number }>;
  getPlayerAdp(playerId: number, leagueType: string, scoringFormat: string, season: number): Promise<PlayerAdp | undefined>;
  getCompletedLeaguesByType(leagueType: string, scoringFormat: string, season: number): Promise<League[]>;

  // Active drafts
  getActiveDraftLeagues(): Promise<League[]>;

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

  async getBestAvailablePlayer(excludeIds: number[], position?: string): Promise<Player | undefined> {
    const buildConditions = (includeMLB: boolean) => {
      const conds: ReturnType<typeof eq>[] = [];
      if (excludeIds.length > 0) {
        conds.push(notInArray(players.id, excludeIds));
      }
      if (position) {
        if (position === "OF") {
          conds.push(inArray(players.position, ["OF", "LF", "CF", "RF"]));
        } else {
          conds.push(eq(players.position, position));
        }
      }
      if (includeMLB) {
        conds.push(eq(players.mlbLevel, "MLB"));
      }
      return conds.length > 0 ? and(...conds) : undefined;
    };

    const [mlbPlayer] = await db.select().from(players)
      .where(buildConditions(true))
      .orderBy(desc(players.points), asc(players.name))
      .limit(1);

    if (mlbPlayer) return mlbPlayer;

    const [anyPlayer] = await db.select().from(players)
      .where(buildConditions(false))
      .orderBy(desc(players.points), asc(players.name))
      .limit(1);

    return anyPlayer || undefined;
  }

  async getCompletedLeaguesByType(leagueType: string, scoringFormat: string, season: number): Promise<League[]> {
    const allCompleted = await db.select().from(leagues).where(eq(leagues.draftStatus, "completed"));
    return allCompleted.filter(l => {
      const lType = l.type || "Redraft";
      const lScoring = l.scoringFormat || "5x5 Roto";
      const lYear = l.createdAt ? new Date(l.createdAt).getFullYear() : 2026;
      return lType === leagueType && lScoring === scoringFormat && lYear === season;
    });
  }

  async recalculateAdp(leagueType: string, scoringFormat: string, season: number): Promise<void> {
    const completedLeagues = await this.getCompletedLeaguesByType(leagueType, scoringFormat, season);
    if (completedLeagues.length === 0) return;

    const draftCount = completedLeagues.length;
    const playerPositionSums = new Map<number, number>();

    const allPlayerRows = await db.select({ id: players.id }).from(players);
    const allPlayerIds = new Set(allPlayerRows.map(p => p.id));

    for (const league of completedLeagues) {
      const picks = await this.getDraftPicksByLeague(league.id);
      const draftedInThisLeague = new Set<number>();

      for (const pick of picks) {
        draftedInThisLeague.add(pick.playerId);
        const current = playerPositionSums.get(pick.playerId) || 0;
        playerPositionSums.set(pick.playerId, current + pick.overallPick);
      }

      allPlayerRows.forEach(p => {
        if (!draftedInThisLeague.has(p.id)) {
          const current = playerPositionSums.get(p.id) || 0;
          playerPositionSums.set(p.id, current + 9999);
        }
      });
    }

    await db.delete(playerAdp).where(
      and(
        eq(playerAdp.leagueType, leagueType),
        eq(playerAdp.scoringFormat, scoringFormat),
        eq(playerAdp.season, season)
      )
    );

    const records: InsertPlayerAdp[] = [];
    playerPositionSums.forEach((totalSum, playerId) => {
      const adpValue = Math.round(totalSum / draftCount);
      records.push({
        playerId,
        leagueType,
        scoringFormat,
        season,
        adp: adpValue,
        draftCount,
        totalPositionSum: totalSum,
      });
    });

    const BATCH_SIZE = 500;
    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      await db.insert(playerAdp).values(records.slice(i, i + BATCH_SIZE));
    }
  }

  async getAdp(leagueType: string, scoringFormat: string, season: number, limit = 50, offset = 0): Promise<{ adpRecords: PlayerAdp[]; total: number }> {
    const conditions = and(
      eq(playerAdp.leagueType, leagueType),
      eq(playerAdp.scoringFormat, scoringFormat),
      eq(playerAdp.season, season)
    );

    const [countResult] = await db.select({ count: sql<number>`count(*)` }).from(playerAdp).where(conditions);
    const total = Number(countResult.count);

    const adpRecords = await db.select().from(playerAdp)
      .where(conditions)
      .orderBy(asc(playerAdp.adp))
      .limit(limit)
      .offset(offset);

    return { adpRecords, total };
  }

  async getPlayerAdp(playerId: number, leagueType: string, scoringFormat: string, season: number): Promise<PlayerAdp | undefined> {
    const [record] = await db.select().from(playerAdp).where(
      and(
        eq(playerAdp.playerId, playerId),
        eq(playerAdp.leagueType, leagueType),
        eq(playerAdp.scoringFormat, scoringFormat),
        eq(playerAdp.season, season)
      )
    );
    return record || undefined;
  }

  async getActiveDraftLeagues(): Promise<League[]> {
    return await db.select().from(leagues).where(eq(leagues.draftStatus, "active"));
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
