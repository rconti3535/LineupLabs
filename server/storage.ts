import { 
  users, leagues, teams, players, activities, draftPicks, playerAdp, waivers, waiverClaims, dailyLineups, leagueMatchups,
  type User, type InsertUser,
  type League, type InsertLeague,
  type Team, type InsertTeam,
  type Player, type InsertPlayer,
  type DraftPick, type InsertDraftPick,
  type PlayerAdp, type InsertPlayerAdp,
  type Activity, type InsertActivity,
  type Waiver, type InsertWaiver,
  type WaiverClaim, type InsertWaiverClaim,
  type DailyLineup, type InsertDailyLineup,
  type LeagueMatchup, type InsertLeagueMatchup
} from "@shared/schema";
import { db } from "./db";
import { eq, ilike, or, and, sql, notInArray, asc, desc, inArray, gte, gt } from "drizzle-orm";

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
  deleteLeague(id: number): Promise<void>;
  
  // Teams
  getTeamsByUserId(userId: number): Promise<Team[]>;
  getTeamsByLeagueId(leagueId: number): Promise<Team[]>;
  getTeam(id: number): Promise<Team | undefined>;
  createTeam(team: InsertTeam): Promise<Team>;
  
  // Players
  getPlayers(): Promise<Player[]>;
  getPlayer(id: number): Promise<Player | undefined>;
  getPlayersByIds(ids: number[]): Promise<Player[]>;
  searchPlayers(query?: string, position?: string, mlbLevel?: string, limit?: number, offset?: number, adpLeagueType?: string, adpScoringFormat?: string, adpSeason?: number): Promise<{ players: Player[]; total: number }>;
  createPlayer(player: InsertPlayer): Promise<Player>;
  
  // Draft Picks
  getDraftPicksByLeague(leagueId: number): Promise<DraftPick[]>;
  createDraftPick(pick: InsertDraftPick): Promise<DraftPick>;
  updateDraftPickPlayer(leagueId: number, overallPick: number, playerId: number): Promise<DraftPick>;
  getDraftedPlayerIds(leagueId: number): Promise<number[]>;
  getBestAvailablePlayer(excludeIds: number[], position?: string): Promise<Player | undefined>;
  getBestAvailableByAdp(excludeIds: number[], leagueType: string, scoringFormat: string, season: number, eligiblePositions: string[]): Promise<Player | undefined>;

  // ADP
  recalculateAdp(leagueType: string, scoringFormat: string, season: number): Promise<void>;
  getAdp(leagueType: string, scoringFormat: string, season: number, limit?: number, offset?: number): Promise<{ adpRecords: PlayerAdp[]; total: number }>;
  getPlayerAdp(playerId: number, leagueType: string, scoringFormat: string, season: number): Promise<PlayerAdp | undefined>;
  getCompletedLeaguesByType(leagueType: string, scoringFormat: string, season: number): Promise<League[]>;

  // Roster management
  swapRosterSlots(leagueId: number, teamId: number, pickIdA: number, slotA: number, pickIdB: number | null, slotB: number): Promise<void>;
  setRosterSlot(pickId: number, slot: number): Promise<void>;
  getDraftPickById(id: number): Promise<DraftPick | undefined>;

  // Add/Drop
  addPlayerToTeam(leagueId: number, teamId: number, playerId: number, rosterSlot: number): Promise<DraftPick>;
  dropPlayerFromTeam(pickId: number): Promise<void>;
  searchAvailablePlayers(leagueId: number, query?: string, position?: string, limit?: number, offset?: number, playerType?: string, rosterStatus?: string): Promise<{ players: Player[]; total: number }>;

  // Waivers
  createWaiver(waiver: InsertWaiver): Promise<Waiver>;
  getActiveWaiversByLeague(leagueId: number): Promise<Waiver[]>;
  getActiveWaiverForPlayer(leagueId: number, playerId: number): Promise<Waiver | undefined>;
  getWaiverPlayerIds(leagueId: number): Promise<number[]>;
  createWaiverClaim(claim: InsertWaiverClaim): Promise<WaiverClaim>;
  getClaimsForWaiver(waiverId: number): Promise<WaiverClaim[]>;
  getClaimsByTeam(teamId: number): Promise<WaiverClaim[]>;
  getExpiredWaivers(): Promise<Waiver[]>;
  getWaiver(id: number): Promise<Waiver | undefined>;
  completeWaiver(waiverId: number, status: string): Promise<void>;
  deleteWaiverClaim(claimId: number): Promise<void>;

  // Active drafts
  getActiveDraftLeagues(): Promise<League[]>;

  // Activities
  getActivitiesByUserId(userId: number): Promise<Activity[]>;
  createActivity(activity: InsertActivity): Promise<Activity>;

  // Daily Lineups
  getDailyLineup(leagueId: number, teamId: number, date: string): Promise<DailyLineup[]>;
  saveDailyLineup(entries: InsertDailyLineup[]): Promise<void>;
  deleteDailyLineup(leagueId: number, teamId: number, date: string): Promise<void>;
  getDailyLineupDates(leagueId: number, teamId: number): Promise<string[]>;
  getFutureDailyLineupDates(leagueId: number, teamId: number, fromDate: string): Promise<string[]>;
  deleteDailyLineupFromDate(leagueId: number, teamId: number, fromDate: string): Promise<void>;

  // League Matchups
  getMatchupsByLeague(leagueId: number): Promise<LeagueMatchup[]>;
  getMatchupsByLeagueAndWeek(leagueId: number, week: number): Promise<LeagueMatchup[]>;
  createMatchups(matchups: InsertLeagueMatchup[]): Promise<void>;
  deleteMatchupsByLeague(leagueId: number): Promise<void>;
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

  async deleteLeague(id: number): Promise<void> {
    const leagueWaivers = await db.select().from(waivers).where(eq(waivers.leagueId, id));
    if (leagueWaivers.length > 0) {
      const waiverIds = leagueWaivers.map(w => w.id);
      await db.delete(waiverClaims).where(inArray(waiverClaims.waiverId, waiverIds));
      await db.delete(waivers).where(eq(waivers.leagueId, id));
    }

    await db.delete(leagueMatchups).where(eq(leagueMatchups.leagueId, id));
    await db.delete(draftPicks).where(eq(draftPicks.leagueId, id));
    await db.delete(teams).where(eq(teams.leagueId, id));
    await db.delete(leagues).where(eq(leagues.id, id));
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

  async getPlayersByIds(ids: number[]): Promise<Player[]> {
    if (ids.length === 0) return [];
    const result = await db.select().from(players).where(inArray(players.id, ids));
    return result;
  }

  async searchPlayers(query?: string, position?: string, mlbLevel?: string, limit = 50, offset = 0, adpLeagueType?: string, adpScoringFormat?: string, adpSeason?: number): Promise<{ players: Player[]; total: number }> {
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

    if (adpLeagueType && adpScoringFormat && adpSeason) {
      const result = await db
        .select({ player: players, adpValue: playerAdp.adp })
        .from(players)
        .leftJoin(
          playerAdp,
          and(
            eq(playerAdp.playerId, players.id),
            eq(playerAdp.leagueType, adpLeagueType),
            eq(playerAdp.scoringFormat, adpScoringFormat),
            eq(playerAdp.season, adpSeason)
          )
        )
        .where(where)
        .orderBy(sql`COALESCE(${playerAdp.adp}, 9999) ASC`)
        .limit(limit)
        .offset(offset);

      return { players: result.map(r => r.player), total };
    }

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

  async updateDraftPickPlayer(leagueId: number, overallPick: number, playerId: number): Promise<DraftPick> {
    const [updated] = await db
      .update(draftPicks)
      .set({ playerId, pickedAt: new Date() })
      .where(
        and(
          eq(draftPicks.leagueId, leagueId),
          eq(draftPicks.overallPick, overallPick)
        )
      )
      .returning();
    return updated;
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

  async getBestAvailableByAdp(excludeIds: number[], leagueType: string, scoringFormat: string, season: number, eligiblePositions: string[]): Promise<Player | undefined> {
    const expandedPositions: string[] = [];
    for (const pos of eligiblePositions) {
      if (pos === "OF") {
        expandedPositions.push("OF", "LF", "CF", "RF");
      } else {
        expandedPositions.push(pos);
      }
    }
    const uniquePositions = Array.from(new Set(expandedPositions));

    const adpConditions = and(
      eq(playerAdp.leagueType, leagueType),
      eq(playerAdp.scoringFormat, scoringFormat),
      eq(playerAdp.season, season),
      ...(excludeIds.length > 0 ? [notInArray(playerAdp.playerId, excludeIds)] : [])
    );

    const adpRecords = await db.select().from(playerAdp)
      .innerJoin(players, eq(playerAdp.playerId, players.id))
      .where(and(
        adpConditions,
        inArray(players.position, uniquePositions),
        eq(players.mlbLevel, "MLB")
      ))
      .orderBy(asc(playerAdp.adp))
      .limit(1);

    if (adpRecords.length > 0) return adpRecords[0].players;

    const adpRecordsFallback = await db.select().from(playerAdp)
      .innerJoin(players, eq(playerAdp.playerId, players.id))
      .where(and(
        adpConditions,
        inArray(players.position, uniquePositions)
      ))
      .orderBy(asc(playerAdp.adp))
      .limit(1);

    if (adpRecordsFallback.length > 0) return adpRecordsFallback[0].players;

    const conds = [
      inArray(players.position, uniquePositions),
      ...(excludeIds.length > 0 ? [notInArray(players.id, excludeIds)] : [])
    ];
    const [fallback] = await db.select().from(players)
      .where(and(...conds, eq(players.mlbLevel, "MLB")))
      .orderBy(desc(players.points), asc(players.name))
      .limit(1);

    if (fallback) return fallback;

    const [anyFallback] = await db.select().from(players)
      .where(and(...conds))
      .orderBy(desc(players.points), asc(players.name))
      .limit(1);

    return anyFallback || undefined;
  }

  async getCompletedLeaguesByType(leagueType: string, scoringFormat: string, season: number): Promise<League[]> {
    const allCompleted = await db.select().from(leagues).where(eq(leagues.draftStatus, "completed"));
    return allCompleted.filter(l => {
      const lType = l.type || "Redraft";
      const lScoring = l.scoringFormat || "Roto";
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

  async getDraftPickById(id: number): Promise<DraftPick | undefined> {
    const [pick] = await db.select().from(draftPicks).where(eq(draftPicks.id, id));
    return pick || undefined;
  }

  async setRosterSlot(pickId: number, slot: number): Promise<void> {
    await db.update(draftPicks).set({ rosterSlot: slot }).where(eq(draftPicks.id, pickId));
  }

  async swapRosterSlots(leagueId: number, teamId: number, pickIdA: number, slotA: number, pickIdB: number | null, slotB: number): Promise<void> {
    await db.update(draftPicks).set({ rosterSlot: slotB }).where(eq(draftPicks.id, pickIdA));
    if (pickIdB !== null) {
      await db.update(draftPicks).set({ rosterSlot: slotA }).where(eq(draftPicks.id, pickIdB));
    }
  }

  async addPlayerToTeam(leagueId: number, teamId: number, playerId: number, rosterSlot: number): Promise<DraftPick> {
    const picks = await db.select().from(draftPicks).where(eq(draftPicks.leagueId, leagueId));
    const maxOverall = picks.reduce((max, p) => Math.max(max, p.overallPick), 0);
    const teamPicks = picks.filter(p => p.teamId === teamId);
    const maxRound = teamPicks.reduce((max, p) => Math.max(max, p.round), 0);

    const [pick] = await db.insert(draftPicks).values({
      leagueId,
      teamId,
      playerId,
      overallPick: maxOverall + 1,
      round: maxRound + 1,
      pickInRound: 1,
      rosterSlot,
      pickedAt: new Date(),
    }).returning();
    return pick;
  }

  async dropPlayerFromTeam(pickId: number): Promise<void> {
    await db.delete(draftPicks).where(eq(draftPicks.id, pickId));
  }

  async searchAvailablePlayers(leagueId: number, query?: string, position?: string, limit = 50, offset = 0, playerType?: string, rosterStatus?: string): Promise<{ players: Player[]; total: number }> {
    const draftedIds = await this.getDraftedPlayerIds(leagueId);

    const conditions: ReturnType<typeof eq>[] = [];
    conditions.push(eq(players.mlbLevel, "MLB"));
    if (rosterStatus === "free_agents" || !rosterStatus) {
      if (draftedIds.length > 0) {
        conditions.push(notInArray(players.id, draftedIds));
      }
    } else if (rosterStatus === "rostered") {
      if (draftedIds.length > 0) {
        conditions.push(inArray(players.id, draftedIds));
      } else {
        return { players: [], total: 0 };
      }
    }
    if (query) {
      conditions.push(ilike(players.name, `%${query}%`));
    }
    if (position) {
      if (position === "OF") {
        conditions.push(inArray(players.position, ["OF", "LF", "CF", "RF"]));
      } else {
        conditions.push(eq(players.position, position));
      }
    }
    if (!position && playerType === "batters") {
      conditions.push(inArray(players.position, ["C", "1B", "2B", "3B", "SS", "OF", "LF", "CF", "RF", "DH", "UT"]));
    } else if (!position && playerType === "pitchers") {
      conditions.push(inArray(players.position, ["SP", "RP", "P"]));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const [countResult] = await db.select({ count: sql<number>`count(*)` }).from(players).where(where);
    const total = Number(countResult.count);
    const result = await db.select().from(players).where(where)
      .orderBy(sql`COALESCE(${players.externalAdp}, 99999)`, players.name)
      .limit(limit).offset(offset);

    const playerIds = result.map(p => p.id);
    let adpMap: Record<number, number> = {};
    if (playerIds.length > 0) {
      const adpRows = await db.select({ playerId: playerAdp.playerId, adp: playerAdp.adp })
        .from(playerAdp)
        .where(inArray(playerAdp.playerId, playerIds));
      for (const row of adpRows) {
        adpMap[row.playerId] = row.adp;
      }
    }

    const playersWithAdp = result.map(p => ({
      ...p,
      adpValue: adpMap[p.id] ?? null,
    }));

    return { players: playersWithAdp, total };
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

  async createWaiver(waiver: InsertWaiver): Promise<Waiver> {
    const [w] = await db.insert(waivers).values(waiver).returning();
    return w;
  }

  async getActiveWaiversByLeague(leagueId: number): Promise<Waiver[]> {
    return await db.select().from(waivers).where(
      and(eq(waivers.leagueId, leagueId), eq(waivers.status, "active"))
    );
  }

  async getActiveWaiverForPlayer(leagueId: number, playerId: number): Promise<Waiver | undefined> {
    const [w] = await db.select().from(waivers).where(
      and(eq(waivers.leagueId, leagueId), eq(waivers.playerId, playerId), eq(waivers.status, "active"))
    );
    return w || undefined;
  }

  async getWaiverPlayerIds(leagueId: number): Promise<number[]> {
    const rows = await db.select({ playerId: waivers.playerId }).from(waivers).where(
      and(eq(waivers.leagueId, leagueId), eq(waivers.status, "active"))
    );
    return rows.map(r => r.playerId);
  }

  async createWaiverClaim(claim: InsertWaiverClaim): Promise<WaiverClaim> {
    const [c] = await db.insert(waiverClaims).values(claim).returning();
    return c;
  }

  async getClaimsForWaiver(waiverId: number): Promise<WaiverClaim[]> {
    return await db.select().from(waiverClaims).where(eq(waiverClaims.waiverId, waiverId));
  }

  async getClaimsByTeam(teamId: number): Promise<WaiverClaim[]> {
    return await db.select().from(waiverClaims).where(eq(waiverClaims.teamId, teamId));
  }

  async getWaiver(id: number): Promise<Waiver | undefined> {
    const [w] = await db.select().from(waivers).where(eq(waivers.id, id));
    return w || undefined;
  }

  async getExpiredWaivers(): Promise<Waiver[]> {
    const now = new Date().toISOString();
    return await db.select().from(waivers).where(
      and(eq(waivers.status, "active"), sql`${waivers.waiverExpiresAt} <= ${now}`)
    );
  }

  async completeWaiver(waiverId: number, status: string): Promise<void> {
    await db.update(waivers).set({ status }).where(eq(waivers.id, waiverId));
  }

  async deleteWaiverClaim(claimId: number): Promise<void> {
    await db.delete(waiverClaims).where(eq(waiverClaims.id, claimId));
  }

  async getDailyLineup(leagueId: number, teamId: number, date: string): Promise<DailyLineup[]> {
    return await db.select().from(dailyLineups).where(
      and(
        eq(dailyLineups.leagueId, leagueId),
        eq(dailyLineups.teamId, teamId),
        eq(dailyLineups.date, date)
      )
    ).orderBy(asc(dailyLineups.slotIndex));
  }

  async saveDailyLineup(entries: InsertDailyLineup[]): Promise<void> {
    if (entries.length === 0) return;
    await db.insert(dailyLineups).values(entries);
  }

  async deleteDailyLineup(leagueId: number, teamId: number, date: string): Promise<void> {
    await db.delete(dailyLineups).where(
      and(
        eq(dailyLineups.leagueId, leagueId),
        eq(dailyLineups.teamId, teamId),
        eq(dailyLineups.date, date)
      )
    );
  }

  async getDailyLineupDates(leagueId: number, teamId: number): Promise<string[]> {
    const rows = await db.selectDistinct({ date: dailyLineups.date })
      .from(dailyLineups)
      .where(and(eq(dailyLineups.leagueId, leagueId), eq(dailyLineups.teamId, teamId)))
      .orderBy(desc(dailyLineups.date));
    return rows.map(r => r.date);
  }

  async getFutureDailyLineupDates(leagueId: number, teamId: number, fromDate: string): Promise<string[]> {
    const rows = await db.selectDistinct({ date: dailyLineups.date })
      .from(dailyLineups)
      .where(and(
        eq(dailyLineups.leagueId, leagueId),
        eq(dailyLineups.teamId, teamId),
        gt(dailyLineups.date, fromDate)
      ))
      .orderBy(asc(dailyLineups.date));
    return rows.map(r => r.date);
  }

  async deleteDailyLineupFromDate(leagueId: number, teamId: number, fromDate: string): Promise<void> {
    await db.delete(dailyLineups).where(
      and(
        eq(dailyLineups.leagueId, leagueId),
        eq(dailyLineups.teamId, teamId),
        gte(dailyLineups.date, fromDate)
      )
    );
  }

  async getMatchupsByLeague(leagueId: number): Promise<LeagueMatchup[]> {
    return await db.select().from(leagueMatchups)
      .where(eq(leagueMatchups.leagueId, leagueId))
      .orderBy(asc(leagueMatchups.week));
  }

  async getMatchupsByLeagueAndWeek(leagueId: number, week: number): Promise<LeagueMatchup[]> {
    return await db.select().from(leagueMatchups)
      .where(and(eq(leagueMatchups.leagueId, leagueId), eq(leagueMatchups.week, week)));
  }

  async createMatchups(matchups: InsertLeagueMatchup[]): Promise<void> {
    if (matchups.length === 0) return;
    await db.insert(leagueMatchups).values(matchups);
  }

  async deleteMatchupsByLeague(leagueId: number): Promise<void> {
    await db.delete(leagueMatchups).where(eq(leagueMatchups.leagueId, leagueId));
  }

  // Transactions
  async getTransactionsByLeague(leagueId: number): Promise<LeagueTransaction[]> {
    return await db.select().from(leagueTransactions)
      .where(eq(leagueTransactions.leagueId, leagueId))
      .orderBy(desc(leagueTransactions.createdAt));
  }

  async createTransaction(transaction: InsertLeagueTransaction): Promise<LeagueTransaction> {
    const [newTransaction] = await db.insert(leagueTransactions).values(transaction).returning();
    return newTransaction;
  }

  async getDailyLineup(leagueId: number, teamId: number, date: string): Promise<DailyLineup[]> {
    return await db.select().from(dailyLineups)
      .where(and(
        eq(dailyLineups.leagueId, leagueId),
        eq(dailyLineups.teamId, teamId),
        eq(dailyLineups.date, date)
      ));
  }

  async saveDailyLineup(entries: InsertDailyLineup[]): Promise<void> {
    if (entries.length === 0) return;
    for (const entry of entries) {
      const existing = await db.select().from(dailyLineups).where(and(
        eq(dailyLineups.leagueId, entry.leagueId),
        eq(dailyLineups.teamId, entry.teamId),
        eq(dailyLineups.date, entry.date),
        eq(dailyLineups.slotIndex, entry.slotIndex)
      ));
      if (existing.length > 0) {
        await db.update(dailyLineups).set(entry).where(eq(dailyLineups.id, existing[0].id));
      } else {
        await db.insert(dailyLineups).values(entry);
      }
    }
  }

  async deleteDailyLineup(leagueId: number, teamId: number, date: string): Promise<void> {
    await db.delete(dailyLineups).where(and(
      eq(dailyLineups.leagueId, leagueId),
      eq(dailyLineups.teamId, teamId),
      eq(dailyLineups.date, date)
    ));
  }

  async getDailyLineupDates(leagueId: number, teamId: number): Promise<string[]> {
    const rows = await db.selectDistinct({ date: dailyLineups.date })
      .from(dailyLineups)
      .where(and(
        eq(dailyLineups.leagueId, leagueId),
        eq(dailyLineups.teamId, teamId)
      ))
      .orderBy(asc(dailyLineups.date));
    return rows.map(r => r.date);
  }

  async getFutureDailyLineupDates(leagueId: number, teamId: number, fromDate: string): Promise<string[]> {
    const rows = await db.selectDistinct({ date: dailyLineups.date })
      .from(dailyLineups)
      .where(and(
        eq(dailyLineups.leagueId, leagueId),
        eq(dailyLineups.teamId, teamId),
        gt(dailyLineups.date, fromDate)
      ))
      .orderBy(asc(dailyLineups.date));
    return rows.map(r => r.date);
  }

  async deleteDailyLineupFromDate(leagueId: number, teamId: number, fromDate: string): Promise<void> {
    await db.delete(dailyLineups).where(
      and(
        eq(dailyLineups.leagueId, leagueId),
        eq(dailyLineups.teamId, teamId),
        gte(dailyLineups.date, fromDate)
      )
    );
  }
}

export const storage = new DatabaseStorage();
