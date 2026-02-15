import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  name: text("name").notNull(),
  avatar: text("avatar"),
  leagues: integer("leagues").default(0),
  wins: integer("wins").default(0),
  championships: integer("championships").default(0),
});

export const leagues = pgTable("leagues", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  type: text("type").default("Redraft"), // Redraft, Dynasty
  numberOfTeams: integer("number_of_teams").default(12),
  scoringFormat: text("scoring_format").default("Roto"),
  hittingCategories: text("hitting_categories").array().default(["R", "HR", "RBI", "SB", "AVG"]),
  pitchingCategories: text("pitching_categories").array().default(["W", "SV", "K", "ERA", "WHIP"]),
  isPublic: boolean("is_public").default(false),
  maxTeams: integer("max_teams").default(12),
  currentTeams: integer("current_teams").default(0),
  buyin: text("buyin").default("Free"),
  prize: text("prize").default("Trophy"),
  status: text("status").default("Open"), // Open, Full, Active, Completed
  rosterPositions: text("roster_positions").array().default(["C", "1B", "2B", "3B", "SS", "OF", "OF", "OF", "UT", "SP", "SP", "RP", "RP", "BN", "BN", "IL"]),
  draftType: text("draft_type").default("Snake"),
  draftDate: text("draft_date"),
  secondsPerPick: integer("seconds_per_pick").default(60),
  draftOrder: text("draft_order").default("Random"),
  draftStatus: text("draft_status").default("pending"),
  draftPickStartedAt: text("draft_pick_started_at"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const teams = pgTable("teams", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  leagueId: integer("league_id").references(() => leagues.id),
  userId: integer("user_id").references(() => users.id),
  wins: integer("wins").default(0),
  losses: integer("losses").default(0),
  points: integer("points").default(0),
  rank: integer("rank").default(1),
  logo: text("logo"),
  nextOpponent: text("next_opponent"),
  isCpu: boolean("is_cpu").default(false),
});

export const players = pgTable("players", {
  id: serial("id").primaryKey(),
  mlbId: integer("mlb_id").unique(),
  name: text("name").notNull(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  position: text("position").notNull(),
  team: text("team").notNull(),
  teamAbbreviation: text("team_abbreviation"),
  jerseyNumber: text("jersey_number"),
  bats: text("bats"),
  throws: text("throws"),
  age: integer("age"),
  height: text("height"),
  weight: integer("weight"),
  mlbLevel: text("mlb_level").default("MLB"),
  avatar: text("avatar"),
  points: integer("points").default(0),
  status: text("status").default("Active"),
  statR: integer("stat_r").default(0),
  statHR: integer("stat_hr").default(0),
  statRBI: integer("stat_rbi").default(0),
  statSB: integer("stat_sb").default(0),
  statAVG: text("stat_avg").default(".000"),
  statH: integer("stat_h").default(0),
  stat2B: integer("stat_2b").default(0),
  stat3B: integer("stat_3b").default(0),
  statBB: integer("stat_bb").default(0),
  statK: integer("stat_k").default(0),
  statOBP: text("stat_obp").default(".000"),
  statSLG: text("stat_slg").default(".000"),
  statOPS: text("stat_ops").default(".000"),
  statTB: integer("stat_tb").default(0),
  statCS: integer("stat_cs").default(0),
  statHBP: integer("stat_hbp").default(0),
  statAB: integer("stat_ab").default(0),
  statPA: integer("stat_pa").default(0),
  statW: integer("stat_w").default(0),
  statSV: integer("stat_sv").default(0),
  statERA: text("stat_era").default("0.00"),
  statWHIP: text("stat_whip").default("0.00"),
  statL: integer("stat_l").default(0),
  statQS: integer("stat_qs").default(0),
  statHLD: integer("stat_hld").default(0),
  statIP: text("stat_ip").default("0.0"),
  statSO: integer("stat_so").default(0),
  statBBp: integer("stat_bb_p").default(0),
  statHRp: integer("stat_hr_p").default(0),
  statCG: integer("stat_cg").default(0),
  statSHO: integer("stat_sho").default(0),
  statBSV: integer("stat_bsv").default(0),
  statER: integer("stat_er").default(0),
  statHA: integer("stat_ha").default(0),
  statIPOuts: integer("stat_ip_outs").default(0),
  projR: integer("proj_r"),
  projHR: integer("proj_hr"),
  projRBI: integer("proj_rbi"),
  projSB: integer("proj_sb"),
  projAVG: text("proj_avg"),
  projH: integer("proj_h"),
  proj2B: integer("proj_2b"),
  proj3B: integer("proj_3b"),
  projBB: integer("proj_bb"),
  projK: integer("proj_k"),
  projOBP: text("proj_obp"),
  projSLG: text("proj_slg"),
  projOPS: text("proj_ops"),
  projTB: integer("proj_tb"),
  projCS: integer("proj_cs"),
  projHBP: integer("proj_hbp"),
  projAB: integer("proj_ab"),
  projPA: integer("proj_pa"),
  projW: integer("proj_w"),
  projSV: integer("proj_sv"),
  projERA: text("proj_era"),
  projWHIP: text("proj_whip"),
  projL: integer("proj_l"),
  projQS: integer("proj_qs"),
  projHLD: integer("proj_hld"),
  projIP: text("proj_ip"),
  projSO: integer("proj_so"),
  projCG: integer("proj_cg"),
  projSHO: integer("proj_sho"),
  projBSV: integer("proj_bsv"),
  externalAdp: integer("external_adp"),
});

export const draftPicks = pgTable("draft_picks", {
  id: serial("id").primaryKey(),
  leagueId: integer("league_id").references(() => leagues.id).notNull(),
  teamId: integer("team_id").references(() => teams.id).notNull(),
  playerId: integer("player_id").references(() => players.id).notNull(),
  overallPick: integer("overall_pick").notNull(),
  round: integer("round").notNull(),
  pickInRound: integer("pick_in_round").notNull(),
  pickedAt: timestamp("picked_at").defaultNow(),
  rosterSlot: integer("roster_slot"),
});

export const playerAdp = pgTable("player_adp", {
  id: serial("id").primaryKey(),
  playerId: integer("player_id").references(() => players.id).notNull(),
  leagueType: text("league_type").notNull(),
  scoringFormat: text("scoring_format").notNull(),
  season: integer("season").notNull(),
  adp: integer("adp").notNull(),
  draftCount: integer("draft_count").notNull(),
  totalPositionSum: integer("total_position_sum").notNull(),
});

export const activities = pgTable("activities", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  message: text("message").notNull(),
  time: text("time").notNull(),
  avatar: text("avatar"),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  leagues: true,
  wins: true,
  championships: true,
});

export const insertLeagueSchema = createInsertSchema(leagues).omit({
  id: true,
  currentTeams: true,
  createdAt: true,
});

export const insertTeamSchema = createInsertSchema(teams).omit({
  id: true,
  wins: true,
  losses: true,
  points: true,
  rank: true,
});

export const insertPlayerSchema = createInsertSchema(players).omit({
  id: true,
  points: true,
  status: true,
});

export const insertDraftPickSchema = createInsertSchema(draftPicks).omit({
  id: true,
  pickedAt: true,
});

export const insertPlayerAdpSchema = createInsertSchema(playerAdp).omit({
  id: true,
});

export const waivers = pgTable("waivers", {
  id: serial("id").primaryKey(),
  leagueId: integer("league_id").references(() => leagues.id).notNull(),
  playerId: integer("player_id").references(() => players.id).notNull(),
  droppedByTeamId: integer("dropped_by_team_id").references(() => teams.id).notNull(),
  waiverExpiresAt: text("waiver_expires_at").notNull(),
  status: text("status").default("active"),
  createdAt: text("created_at").notNull(),
});

export const waiverClaims = pgTable("waiver_claims", {
  id: serial("id").primaryKey(),
  waiverId: integer("waiver_id").references(() => waivers.id).notNull(),
  teamId: integer("team_id").references(() => teams.id).notNull(),
  dropPickId: integer("drop_pick_id"),
  createdAt: text("created_at").notNull(),
});

export const insertWaiverSchema = createInsertSchema(waivers).omit({
  id: true,
});

export const insertWaiverClaimSchema = createInsertSchema(waiverClaims).omit({
  id: true,
});

export const insertActivitySchema = createInsertSchema(activities).omit({
  id: true,
});

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type League = typeof leagues.$inferSelect;
export type InsertLeague = z.infer<typeof insertLeagueSchema>;
export type Team = typeof teams.$inferSelect;
export type InsertTeam = z.infer<typeof insertTeamSchema>;
export type Player = typeof players.$inferSelect;
export type InsertPlayer = z.infer<typeof insertPlayerSchema>;
export type DraftPick = typeof draftPicks.$inferSelect;
export type InsertDraftPick = z.infer<typeof insertDraftPickSchema>;
export type PlayerAdp = typeof playerAdp.$inferSelect;
export type InsertPlayerAdp = z.infer<typeof insertPlayerAdpSchema>;
export type Activity = typeof activities.$inferSelect;
export type InsertActivity = z.infer<typeof insertActivitySchema>;
export type Waiver = typeof waivers.$inferSelect;
export type InsertWaiver = z.infer<typeof insertWaiverSchema>;
export type WaiverClaim = typeof waiverClaims.$inferSelect;
export type InsertWaiverClaim = z.infer<typeof insertWaiverClaimSchema>;
