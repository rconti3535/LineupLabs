/**
 * ============================================================================
 *  BOT SIMULATION SERVICE — Stepwise Accelerated Poisson Distribution Model
 * ============================================================================
 *
 * This service organically fills and drafts leagues using simulated bot users.
 * All event scheduling uses a stepwise accelerated Poisson distribution model
 * with three clearly defined zones:
 *
 *  ZONE 1 — Normal range (last event < ACCELERATION_THRESHOLD ago):
 *    Use standard Poisson with base lambda. Produces completely organic,
 *    exponentially-distributed random wait times. Average wait = 1/lambda.
 *
 *  ZONE 2 — Acceleration zone (last event >= ACCELERATION_THRESHOLD ago):
 *    Double the lambda, cutting the average wait in half. This lets the
 *    system "catch up" naturally when it's been quiet for a while.
 *
 *  ZONE 3 — Hard cap (last event >= HARD_CAP ago):
 *    Force the event to fire immediately. A pure safety net that should
 *    almost never trigger in practice because Zone 2 brings things back
 *    on track well before this.
 *
 * DRAFT START RULE:
 *   A draft starts ONLY when a league is completely full (all slots occupied
 *   by real users or bots) AND the scheduled draft time has passed.
 *   If an auto-created league reaches draft time and is still not full, the
 *   draft is pushed back by 5 minutes and checked again later.
 *
 * DRAFT LOCK RULE:
 *   Once a draft starts, NO additional users or bots may join the league.
 *   This is enforced at the API level in server/routes.ts.
 *
 * BOT POOL MANAGEMENT:
 *   An in-memory Set tracks which bots are currently "busy" (assigned to a
 *   league with an active draft). On startup the set is restored from DB.
 *   Before assigning a bot to any league, the busy set is checked. When a
 *   draft completes the bot is released. At current lambda values, bot
 *   exhaustion is effectively impossible.
 *
 * ============================================================================
 */

import { db } from "./db";
import { users, leagues, teams, players, draftPicks } from "@shared/schema";
import { eq, and, ne, sql, asc, inArray, notInArray, desc, isNull, or, lte } from "drizzle-orm";
import { broadcastDraftEvent } from "./draft-events";

// ---------------------------------------------------------------------------
//  Configuration — all tuneable via environment variables
// ---------------------------------------------------------------------------

// Base lambda for league creation events.
// 0.002083 ≈ 1 event per ~480 seconds (8 minutes).
const LEAGUE_CREATION_LAMBDA = parseFloat(process.env.LEAGUE_CREATION_LAMBDA || "0.002083");

// Base lambda for bot-join events.
// 0.01776 ≈ 1 event per 56.3 seconds (0.94 minutes).
const BOT_JOIN_LAMBDA = parseFloat(process.env.BOT_JOIN_LAMBDA || "0.01776");

// Base lambda for bot draft picks.
// 0.03 ≈ 1 pick per ~33 seconds — realistic human pace (25-40s range).
const BOT_PICK_LAMBDA = parseFloat(process.env.BOT_PICK_LAMBDA || "0.03");

// Zone 2 kicks in after this many minutes of silence (default 20).
const ACCELERATION_THRESHOLD_MS =
  parseFloat(process.env.POISSON_ACCELERATION_THRESHOLD || "20") * 60 * 1000;

// Zone 3 hard cap — force event after this many minutes (default 30).
const HARD_CAP_MS =
  parseFloat(process.env.POISSON_HARD_CAP || "30") * 60 * 1000;

// Draft time offset — leagues are scheduled 15 minutes after creation.
const DRAFT_OFFSET_MS = 15 * 60 * 1000;
const AUTO_DRAFT_PUSHBACK_MS = 5 * 60 * 1000;

const INF_POSITIONS = ["1B", "2B", "3B", "SS"];

function isAutoLeagueCreationEnabled(): boolean {
  const raw = (process.env.AUTO_LEAGUE_CREATION_ENABLED || "true").trim().toLowerCase();
  return ["1", "true", "yes", "on", "enabled"].includes(raw);
}

// ---------------------------------------------------------------------------
//  Stepwise Poisson helper
// ---------------------------------------------------------------------------

/**
 * Generates the next wait time in milliseconds using a stepwise accelerated
 * Poisson distribution.
 *
 * @param baseLambda - Events per second in the normal range
 * @param elapsedMs  - Milliseconds since the last event of this type fired
 * @returns wait time in milliseconds before the next event should fire
 *
 * Zone 1 (Normal):      elapsed < ACCELERATION_THRESHOLD → use baseLambda
 * Zone 2 (Accelerated): elapsed >= ACCELERATION_THRESHOLD → use 2× baseLambda
 * Zone 3 (Hard cap):    elapsed >= HARD_CAP → return 0 (fire immediately)
 */
function poissonWait(baseLambda: number, elapsedMs: number): number {
  // Zone 3 — hard cap: if we've been silent for too long, fire now
  if (elapsedMs >= HARD_CAP_MS) {
    return 0;
  }

  // Zone 2 — acceleration: double lambda to catch up
  // Zone 1 — normal: use base lambda
  const lambda = elapsedMs >= ACCELERATION_THRESHOLD_MS
    ? baseLambda * 2
    : baseLambda;

  // Inverse CDF of exponential distribution: -ln(1 - U) / λ
  // Result is in seconds; convert to milliseconds
  const waitSeconds = -Math.log(1 - Math.random()) / lambda;
  return Math.round(waitSeconds * 1000);
}

// ---------------------------------------------------------------------------
//  Minor league city list (for auto-created league names)
// ---------------------------------------------------------------------------
const MINOR_LEAGUE_CITIES = [
  "Durham", "Tacoma", "Nashville", "El Paso", "Lehigh Valley", "Salt Lake",
  "Oklahoma City", "Rochester", "Syracuse", "Columbus", "Indianapolis",
  "Louisville", "Memphis", "Reno", "Sacramento", "Albuquerque", "Buffalo",
  "Charlotte", "Gwinnett", "Iowa", "Jacksonville", "Norfolk", "Omaha",
  "Worcester", "Toledo", "Tucson", "Scranton", "Pawtucket", "New Orleans",
  "Portland", "Fresno", "Las Vegas", "Binghamton", "Trenton", "Akron",
  "Erie", "Harrisburg", "Birmingham", "Montgomery", "Pensacola", "Jackson",
  "Chattanooga", "Huntsville", "Corpus Christi", "Frisco", "Midland",
  "San Antonio", "Amarillo", "Tulsa", "Northwest Arkansas", "Springfield",
  "Quad Cities", "Peoria", "Kane County", "Beloit", "Wisconsin",
  "Cedar Rapids", "Dayton", "Fort Wayne", "Lake County", "Lansing",
  "South Bend", "West Michigan",
];

// ---------------------------------------------------------------------------
//  250 realistic bot usernames — varied styles, no patterns
// ---------------------------------------------------------------------------
const BOT_USERNAMES: string[] = [
  "jake_hartwell", "BrooksM42", "trey.davidson", "slugger_pete", "NateRunsIt",
  "carterj_19", "LiamOField", "mason.riley", "aces_high88", "DylanWardJr",
  "tpark_31", "KieranFly", "riley_cross", "BigGameBen", "cooper.james",
  "HunterBSmith", "devlin.c", "RookieKing9", "jace.fuller", "MilesAheadMT",
  "OwenBClark", "dusty_trails", "LoganBats5", "HarrisonJ22", "cole.weston",
  "TylerGrip", "bennett.ray", "SlamDuncan8", "kyleramirez", "ChaseVault",
  "brayden.cole", "VinceBlaze7", "gavin.swift", "ReedMcCoy", "JordanPivot",
  "weston.parke", "NolanEdge", "drew_hendrix", "CallumDrive", "parker.nash",
  "AidenForge", "rhys.tanner", "FelixStorm3", "graham_poe", "DakotaWild",
  "colton.birch", "TravisBolt", "shane.mccall", "RyanHustle", "mav_donovan",
  "ZaneKnox21", "tucker.reid", "HaydnBlitz", "griffin.wave", "TheWillCraft",
  "derek_voss", "CamPulse11", "blaine.rowe", "SilasCurve", "jett_mercer",
  "BradyPeak", "rowan.steele", "FinnCoast", "tate_murphy", "AshtonField",
  "dalton.price", "KaiBreaker", "rex.winters", "SpencerLine", "brody.cain",
  "ElliotDash", "emmett.haze", "CruzControl", "damon.lynch", "AxelRanch",
  "kellan_shore", "MarcusBend", "troy.vance", "IsaacMound", "declan.crew",
  "WyattForce", "grant.stone", "BaxterLoop", "soren_dale", "ChadwickSR",
  "hugo.marsh", "RiverDive42", "shane_craft", "LucasPlays", "reid.walker",
  "NicoSwift", "callen.wade", "JasperGrid", "eli_brooks", "DominicCut",
  "wade.simmons", "PeytonGap", "connor.reave", "SebastiánK", "landon.frey",
  "MaxDrafter", "pierce.hawk", "GarrettSnap", "kian_powell", "BeckettRush",
  "corbin.sage", "TristanWarp", "dante.glenn", "HenriFoxx", "sterling_j",
  "QuinnForge", "atlas_dunn", "ReeceTrail", "kyler.page", "SawyerNuke",
  "remy.chance", "PhoenixBat", "killian_moss", "BeauRipple", "nelson.oak",
  "ZachDrift", "casey.penn", "KnoxViper", "tobias.fenn", "LeviSwitch",
  "arlo.kemp", "CedricHaze", "jonah_bass", "MalcolmRye", "otis.cline",
  "DarianEdge", "seth.noble", "CullenSpin", "milo.shay", "AlexBlitz",
  "warren_hook", "HectorVane", "desmond.gray", "FrankieRun", "ray.bright",
  "OscarField", "ivan.thorn", "NigelDraft", "luka.frost", "BrandonW99",
  "caleb_ridge", "SterlingAce", "dorian.hart", "EzraVault", "leon.pratt",
  "AugustGlide", "byron.slick", "KarlSwing", "devin.lark", "NashFlex",
  "omar.stout", "RhettClimb", "cyrus.peak", "BluePhelps", "hank.ruiz",
  "VictorBurn", "elliot.crow", "JudasTwist", "miles.cope", "XanderPlay",
  "ross.blake", "ThadHammer", "brock.gale", "RomanPulse", "casey_dawn",
  "DuncanFlint", "shawn.lace", "KennyField", "ruben.wade", "PrestonV9",
  "louie_grant", "FergusCrest", "travis.wave", "WesleyPick", "carl.dorn",
  "JerichoFade", "kirk.palm", "SilasForge", "todd.vale", "ArmandoKey",
  "floyd.crane", "DylanNexus", "corey.stag", "HudsonFlare", "chad.voss",
  "BarrettSwim", "peter.gale", "WinslowArc", "kurt.lance", "AldenProwl",
  "mitch.vale", "LorenzoDip", "gabe.slate", "PalmerDusk", "neal.trace",
  "OliverChase", "wayne.bluff", "KevinShift", "danny.plume", "RollandCue",
  "harris.dock", "CliftonRay", "lance.cove", "TerryForge", "simon.knob",
  "DenzelSwap", "clay.ridge", "LeroyBound", "ivan.cliff", "MarshallAim",
  "dean.fleet", "RaymondSky", "phil.brook", "GroverSnag", "ernest.port",
  "NoahLatch", "walter.beam", "JerryScope", "brent.hull", "GilbertFold",
  "alvin.draft", "LorenzoNet", "stuart.bend", "FrancisGrip", "clarence.run",
  "EdgarStride", "martin.cape", "VirgilFuse", "luther.rail", "CecilDrop",
  "horace.tide", "WallaceSpan", "jerome.slot", "DwightMark", "milton.flop",
  "AbnerTwirl", "morris.welt", "ElmerCrank", "harvey.gust", "VernLoop",
];

// ---------------------------------------------------------------------------
//  In-memory state
// ---------------------------------------------------------------------------
const busyBotIds = new Set<number>();
let allBotIds: number[] = [];
let lastLeagueCreationTime = Date.now();
let leagueCreationTimer: ReturnType<typeof setTimeout> | null = null;
const leagueJoinTimers = new Map<number, ReturnType<typeof setTimeout>>();
const leagueJoinNextFireAt = new Map<number, number>();
const lastLeagueJoinSuccessTime = new Map<number, number>();
let joinReconcileTimer: ReturnType<typeof setTimeout> | null = null;
const activeDraftTimers = new Map<number, ReturnType<typeof setTimeout>>();
let lastJoinSchedulerHealthLogAt = 0;

// ---------------------------------------------------------------------------
//  Database helpers
// ---------------------------------------------------------------------------

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function getNextLeagueSequence(city: string, scoringFormat: "Roto" | "Season Points"): Promise<number> {
  const likePattern = `${city} % ${scoringFormat}`;
  const rows = await db
    .select({ name: leagues.name })
    .from(leagues)
    .where(sql`${leagues.name} LIKE ${likePattern}`);

  const nameRegex = new RegExp(`^${escapeRegExp(city)}\\s+(\\d+)\\s+${escapeRegExp(scoringFormat)}$`);
  let maxExisting = 0;

  for (const row of rows) {
    const match = row.name.match(nameRegex);
    if (!match) continue;
    const parsed = parseInt(match[1], 10);
    if (!Number.isNaN(parsed) && parsed > maxExisting) maxExisting = parsed;
  }

  return maxExisting + 1;
}

function getDraftRounds(league: { rosterPositions?: string[] | null; maxRosterSize?: number | null }): number {
  return league.maxRosterSize || (league.rosterPositions || []).length;
}

// ---------------------------------------------------------------------------
//  Bot seeding — create 250 bots on startup if they don't exist
// ---------------------------------------------------------------------------

async function seedBots(): Promise<void> {
  const existing = await db.select({ id: users.id })
    .from(users).where(eq(users.isBot, true));

  if (existing.length >= BOT_USERNAMES.length) {
    allBotIds = existing.map(u => u.id);
    console.log(`[Bot Sim] ${allBotIds.length} bot accounts already exist, skipping seed.`);
    return;
  }

  const existingUsernames = new Set(
    (await db.select({ username: users.username }).from(users)).map(u => u.username)
  );

  let created = 0;
  for (const uname of BOT_USERNAMES) {
    if (existingUsernames.has(uname)) continue;
    try {
      const [bot] = await db.insert(users).values({
        username: uname,
        email: `${uname.replace(/\./g, "_")}@bot.internal`,
        password: "!bot_no_login!",
        name: uname,
        isBot: true,
      }).returning();
      allBotIds.push(bot.id);
      created++;
    } catch {
      // duplicate — skip
    }
  }

  const afterSeed = await db.select({ id: users.id })
    .from(users).where(eq(users.isBot, true));
  allBotIds = afterSeed.map(u => u.id);
  console.log(`[Bot Sim] Seeded ${created} new bot accounts (${allBotIds.length} total).`);
}

// ---------------------------------------------------------------------------
//  Busy bot pool management
// ---------------------------------------------------------------------------

async function restoreBusyBots(): Promise<void> {
  busyBotIds.clear();
  const activeLeagues = await db.select({ id: leagues.id })
    .from(leagues).where(eq(leagues.draftStatus, "active"));

  for (const lg of activeLeagues) {
    const lgTeams = await db.select({ userId: teams.userId })
      .from(teams).where(eq(teams.leagueId, lg.id));
    for (const t of lgTeams) {
      if (t.userId && allBotIds.includes(t.userId)) {
        busyBotIds.add(t.userId);
      }
    }
  }
  console.log(`[Bot Sim] Restored ${busyBotIds.size} busy bots from active drafts.`);
}

function getAvailableBot(): number | null {
  const available = allBotIds.filter(id => !busyBotIds.has(id));
  if (available.length === 0) return null;
  return available[Math.floor(Math.random() * available.length)];
}

function releaseBots(leagueId: number, teamList: { userId: number | null }[]): void {
  for (const t of teamList) {
    if (t.userId && allBotIds.includes(t.userId)) {
      busyBotIds.delete(t.userId);
    }
  }
}

// ---------------------------------------------------------------------------
//  League auto-creation scheduler
// ---------------------------------------------------------------------------

async function createBotLeague(): Promise<void> {
  try {
    // Randomize scoring and team size independently so all combinations appear over time:
    // 10 Roto, 10 Season Points, 12 Roto, 12 Season Points.
    const scoringFormat: "Roto" | "Season Points" = Math.random() < 0.5 ? "Roto" : "Season Points";
    const city = MINOR_LEAGUE_CITIES[Math.floor(Math.random() * MINOR_LEAGUE_CITIES.length)];
    const nextNum = await getNextLeagueSequence(city, scoringFormat);
    const maxTeams = Math.random() < 0.5 ? 10 : 12;
    const leagueName = `${city} ${nextNum} ${scoringFormat}`;

    const draftDate = new Date(Date.now() + DRAFT_OFFSET_MS).toISOString();

    const bestBallPositions = ["C", "INF", "INF", "INF", "INF", "OF", "OF", "OF", "SP", "SP", "SP", "RP", "RP"];

    const [league] = await db.insert(leagues).values({
      name: leagueName,
      type: "Best Ball",
      numberOfTeams: maxTeams,
      maxTeams,
      scoringFormat,
      isPublic: true,
      draftType: "Snake",
      draftDate,
      draftOrder: "Random",
      secondsPerPick: 30,
      rosterPositions: bestBallPositions,
      maxRosterSize: 35,
      status: "Open",
    }).returning();

    console.log(`[Bot Sim] League created: "${leagueName}" (id=${league.id}, ${maxTeams} teams, draft at ${draftDate})`);
  } catch (err) {
    console.error("[Bot Sim] League creation error:", (err as Error).message);
  }
}

function scheduleNextLeagueCreation(): void {
  const elapsed = Date.now() - lastLeagueCreationTime;
  const wait = poissonWait(LEAGUE_CREATION_LAMBDA, elapsed);
  leagueCreationTimer = setTimeout(async () => {
    await createBotLeague();
    lastLeagueCreationTime = Date.now();
    await reconcileLeagueJoinSchedulers();
    scheduleNextLeagueCreation();
  }, wait);
}

// ---------------------------------------------------------------------------
//  Bot join scheduler
// ---------------------------------------------------------------------------

async function isLeagueJoinEligible(leagueId: number): Promise<boolean> {
  const [league] = await db.select().from(leagues).where(eq(leagues.id, leagueId));
  if (!league) return false;
  if (!league.isPublic) return false;
  if (league.draftStatus !== "pending") return false;

  const lgTeams = await db.select().from(teams).where(eq(teams.leagueId, leagueId));
  const humanAndBotCount = lgTeams.filter(t => !t.isCpu).length;
  const maxT = league.maxTeams || league.numberOfTeams || 12;
  return humanAndBotCount < maxT;
}

function clearLeagueJoinScheduler(leagueId: number): void {
  const timer = leagueJoinTimers.get(leagueId);
  if (timer) clearTimeout(timer);
  leagueJoinTimers.delete(leagueId);
  leagueJoinNextFireAt.delete(leagueId);
  lastLeagueJoinSuccessTime.delete(leagueId);
}

async function joinBotToLeague(leagueId: number): Promise<boolean> {
  try {
    const [league] = await db.select().from(leagues).where(eq(leagues.id, leagueId));
    if (!league || !league.isPublic || league.draftStatus !== "pending") return false;

    const lgTeams = await db.select().from(teams).where(eq(teams.leagueId, league.id));
    const humanAndBotCount = lgTeams.filter(t => !t.isCpu).length;
    const maxT = league.maxTeams || league.numberOfTeams || 12;
    if (humanAndBotCount >= maxT) return false;

    const botId = getAvailableBot();
    if (botId === null) {
      console.warn(`[Bot Sim] WARNING: No available bots for league ${league.id} join event.`);
      return false;
    }

    // Check bot isn't already in this league
    const existingTeam = await db.select({ id: teams.id }).from(teams)
      .where(and(eq(teams.leagueId, league.id), eq(teams.userId, botId)));
    if (existingTeam.length > 0) return false;

    const bot = await db.select().from(users).where(eq(users.id, botId)).then(r => r[0]);
    if (!bot) return false;

    const teamName = `${bot.username}'s Team`;

    // Replace a CPU placeholder if one exists
    const cpuTeams = lgTeams.filter(t => t.isCpu).sort((a, b) => (b.draftPosition || 999) - (a.draftPosition || 999));
    const replacedCpu = cpuTeams[0];
    const inheritedPosition = replacedCpu?.draftPosition || null;

    if (replacedCpu) {
      await db.delete(teams).where(eq(teams.id, replacedCpu.id));
    }

    const [newTeam] = await db.insert(teams).values({
      name: teamName,
      leagueId: league.id,
      userId: botId,
      logo: "",
      nextOpponent: "",
    }).returning();

    if (inheritedPosition) {
      await db.update(teams).set({ draftPosition: inheritedPosition }).where(eq(teams.id, newTeam.id));
    }

    broadcastDraftEvent(league.id, "teams-update");
    console.log(`[Bot Sim] Bot "${bot.username}" joined league ${league.id} ("${league.name}")`);
    return true;
  } catch (err) {
    console.error("[Bot Sim] Bot join error:", (err as Error).message);
    return false;
  }
}

function scheduleBotJoinForLeague(leagueId: number): void {
  const existing = leagueJoinTimers.get(leagueId);
  if (existing) clearTimeout(existing);

  const elapsed = Date.now() - (lastLeagueJoinSuccessTime.get(leagueId) ?? Date.now());
  const wait = poissonWait(BOT_JOIN_LAMBDA, elapsed);
  console.log(`[Bot Sim] Scheduled join timer for league ${leagueId} in ${(wait / 1000).toFixed(1)}s`);

  const nextFireAt = Date.now() + wait;
  leagueJoinNextFireAt.set(leagueId, nextFireAt);
  const timer = setTimeout(async () => {
    // Remove fired timer handle first so reconcile can recover from any errors.
    leagueJoinTimers.delete(leagueId);
    leagueJoinNextFireAt.delete(leagueId);
    try {
      console.log(`[Bot Sim] Join event fired for league ${leagueId}`);
      const joined = await joinBotToLeague(leagueId);
      if (joined) {
        // Successful join resets acceleration so next schedule returns to Zone 1.
        lastLeagueJoinSuccessTime.set(leagueId, Date.now());
      }

      if (await isLeagueJoinEligible(leagueId)) {
        scheduleBotJoinForLeague(leagueId);
      } else {
        clearLeagueJoinScheduler(leagueId);
      }
    } catch (err) {
      console.error(`[Bot Sim] Join scheduler error for league ${leagueId}:`, (err as Error).message);
      // Self-heal: if still eligible, arm a fresh independent timer.
      if (await isLeagueJoinEligible(leagueId)) {
        scheduleBotJoinForLeague(leagueId);
      } else {
        clearLeagueJoinScheduler(leagueId);
      }
    }
  }, wait);

  leagueJoinTimers.set(leagueId, timer);
}

async function reconcileLeagueJoinSchedulers(): Promise<void> {
  const publicPendingLeagues = await db.select({ id: leagues.id }).from(leagues).where(
    and(
      eq(leagues.isPublic, true),
      eq(leagues.draftStatus, "pending"),
    )
  );

  const eligible = new Set<number>();
  for (const lg of publicPendingLeagues) {
    if (await isLeagueJoinEligible(lg.id)) {
      eligible.add(lg.id);
      const nextFireAt = leagueJoinNextFireAt.get(lg.id) ?? 0;
      const missingOrStale = !leagueJoinTimers.has(lg.id) || nextFireAt < Date.now() - 5000;
      if (missingOrStale) {
        // Initialize each league with independent jitter so first join events
        // don't appear globally synchronized across leagues.
        if (!lastLeagueJoinSuccessTime.has(lg.id)) {
          const jitterMs = Math.floor(Math.random() * ACCELERATION_THRESHOLD_MS);
          lastLeagueJoinSuccessTime.set(lg.id, Date.now() - jitterMs);
        }
        scheduleBotJoinForLeague(lg.id);
      }
    }
  }

  for (const leagueId of Array.from(leagueJoinTimers.keys())) {
    if (!eligible.has(leagueId)) {
      clearLeagueJoinScheduler(leagueId);
    }
  }

  const now = Date.now();
  if (now - lastJoinSchedulerHealthLogAt >= 30000) {
    lastJoinSchedulerHealthLogAt = now;
    console.log(
      `[Bot Sim] Join scheduler health: eligible=${eligible.size}, activeTimers=${leagueJoinTimers.size}`
    );
  }
}

function scheduleJoinReconcileLoop(): void {
  joinReconcileTimer = setTimeout(async () => {
    await reconcileLeagueJoinSchedulers();
    scheduleJoinReconcileLoop();
  }, 5000);
}

// ---------------------------------------------------------------------------
//  Draft start checker — runs every 60 seconds
// ---------------------------------------------------------------------------

async function checkBotDraftStarts(): Promise<void> {
  try {
    // Find all public pending leagues whose draft time has arrived
    const readyLeagues = await db.select().from(leagues).where(
      and(
        eq(leagues.isPublic, true),
        eq(leagues.draftStatus, "pending"),
        sql`${leagues.draftDate} IS NOT NULL AND ${leagues.draftDate} != ''`,
      )
    );

    for (const league of readyLeagues) {
      const draftTime = new Date(league.draftDate!).getTime();
      if (isNaN(draftTime) || Date.now() < draftTime) continue;

      // Check if league is full (all spots occupied by real users or bots)
      const lgTeams = await db.select().from(teams).where(eq(teams.leagueId, league.id));
      const humanAndBotCount = lgTeams.filter(t => !t.isCpu).length;
      const maxT = league.maxTeams || league.numberOfTeams || 12;

      if (humanAndBotCount < maxT) {
        // Auto-created leagues (createdBy is null) are deferred by 5 minutes
        // whenever they hit draft time but are still not full.
        if (league.createdBy == null) {
          const nextDraftTime = new Date(draftTime + AUTO_DRAFT_PUSHBACK_MS).toISOString();
          await db.update(leagues)
            .set({ draftDate: nextDraftTime })
            .where(eq(leagues.id, league.id));
          broadcastDraftEvent(league.id, "league-settings", { draftDate: nextDraftTime });
          console.log(
            `[Bot Sim] League ${league.id} not full at draft time; pushed draftDate +5m to ${nextDraftTime}`
          );
        }
        continue;
      }

      // Atomic check-and-lock: set to "starting" to prevent races
      const [locked] = await db.update(leagues)
        .set({ draftStatus: "starting" as any })
        .where(and(eq(leagues.id, league.id), eq(leagues.draftStatus, "pending")))
        .returning();

      if (!locked) continue; // Another process got it

      // Assign draft positions if not already set
      const allTeams = await db.select().from(teams).where(eq(teams.leagueId, league.id));
      const hasPositions = allTeams.some(t => t.draftPosition);
      if (!hasPositions) {
        const shuffled = [...allTeams].sort(() => Math.random() - 0.5);
        for (let i = 0; i < shuffled.length; i++) {
          await db.update(teams).set({ draftPosition: i + 1 }).where(eq(teams.id, shuffled[i].id));
        }
      } else {
        const maxSlots = maxT;
        const usedPositions = new Set(allTeams.filter(t => t.draftPosition).map(t => t.draftPosition!));
        const available: number[] = [];
        for (let p = 1; p <= maxSlots; p++) {
          if (!usedPositions.has(p)) available.push(p);
        }
        let idx = 0;
        for (const t of allTeams) {
          if (!t.draftPosition && idx < available.length) {
            await db.update(teams).set({ draftPosition: available[idx++] }).where(eq(teams.id, t.id));
          }
        }
      }

      // Mark bots in this league as busy
      for (const t of allTeams) {
        if (t.userId && allBotIds.includes(t.userId)) {
          busyBotIds.add(t.userId);
        }
      }

      // Start the draft
      await db.update(leagues).set({
        draftStatus: "active",
        draftPickStartedAt: new Date().toISOString(),
      }).where(eq(leagues.id, league.id));

      broadcastDraftEvent(league.id, "draft-status", { action: "start", draftStatus: "active" });
      broadcastDraftEvent(league.id, "teams-update");
      console.log(`[Bot Sim] Draft STARTED for league ${league.id} ("${league.name}")`);

      // Begin bot pick scheduling for this draft
      scheduleBotPick(league.id);
    }
  } catch (err) {
    console.error("[Bot Sim] Draft start check error:", (err as Error).message);
  }
}

// ---------------------------------------------------------------------------
//  Bot drafting — pick scheduling per league
// ---------------------------------------------------------------------------

async function makeBotPick(leagueId: number): Promise<void> {
  try {
    const league = await db.select().from(leagues).where(eq(leagues.id, leagueId)).then(r => r[0]);
    if (!league || league.draftStatus !== "active") {
      activeDraftTimers.delete(leagueId);
      return;
    }

    const rawTeams = await db.select().from(teams).where(eq(teams.leagueId, leagueId));
    const leagueTeams = [...rawTeams].sort((a, b) => (a.draftPosition || 999) - (b.draftPosition || 999));
    const numTeams = leagueTeams.length;
    if (numTeams === 0) return;

    const existingPicks = await db.select().from(draftPicks)
      .where(eq(draftPicks.leagueId, leagueId))
      .orderBy(asc(draftPicks.overallPick));

    const totalRounds = getDraftRounds(league);
    const nextOverall = existingPicks.length + 1;

    // Draft complete?
    if (nextOverall > totalRounds * numTeams) {
      await completeDraft(leagueId, league);
      return;
    }

    // Determine whose turn it is
    const round = Math.ceil(nextOverall / numTeams);
    const pickInRound = ((nextOverall - 1) % numTeams) + 1;
    const isOddRound = round % 2 === 1;
    const teamIndex = isOddRound ? pickInRound - 1 : numTeams - pickInRound;
    const pickingTeam = leagueTeams[teamIndex];
    if (!pickingTeam) return;

    // Only pick for bots — let the main checkExpiredDraftPicks handle human timeouts
    const isBotTeam = pickingTeam.userId != null && allBotIds.includes(pickingTeam.userId);
    if (!isBotTeam) {
      // Real user's turn — schedule a check after a short delay
      scheduleBotPick(leagueId);
      return;
    }

    // Get drafted player IDs for this league
    const draftedIds = existingPicks.map(p => p.playerId);

    // Determine eligible positions based on team roster needs
    const teamPicks = existingPicks.filter(p => p.teamId === pickingTeam.id);
    const teamPlayerPositions: string[] = [];
    for (const pick of teamPicks) {
      const [pl] = await db.select({ position: players.position })
        .from(players).where(eq(players.id, pick.playerId));
      if (pl) teamPlayerPositions.push(pl.position);
    }

    const eligiblePositions = computeEligiblePositions(league, teamPlayerPositions);

    // Pick best available by ADP
    let selectedPlayer = await pickByAdp(draftedIds, eligiblePositions);

    // Fallback: best by points for each eligible position
    if (!selectedPlayer) {
      for (const pos of eligiblePositions) {
        selectedPlayer = await pickFallback(draftedIds, pos);
        if (selectedPlayer) break;
      }
    }

    // Last resort: any available player
    if (!selectedPlayer) {
      selectedPlayer = await pickFallback(draftedIds);
    }

    if (!selectedPlayer) {
      await completeDraft(leagueId, league);
      return;
    }

    // Make the pick
    try {
      await db.insert(draftPicks).values({
        leagueId,
        teamId: pickingTeam.id,
        playerId: selectedPlayer.id,
        overallPick: nextOverall,
        round,
        pickInRound,
      });
    } catch (insertErr: any) {
      if (insertErr?.code === "23505") {
        // Duplicate — skip and reschedule
        scheduleBotPick(leagueId);
        return;
      }
      throw insertErr;
    }

    broadcastDraftEvent(leagueId, "pick", {
      overallPick: nextOverall,
      playerId: selectedPlayer.id,
      teamId: pickingTeam.id,
    });

    const totalPicks = totalRounds * numTeams;
    if (nextOverall >= totalPicks) {
      await completeDraft(leagueId, league);
    } else {
      await db.update(leagues).set({ draftPickStartedAt: new Date().toISOString() })
        .where(eq(leagues.id, leagueId));
      scheduleBotPick(leagueId);
    }
  } catch (err) {
    console.error(`[Bot Sim] Pick error league ${leagueId}:`, (err as Error).message);
    scheduleBotPick(leagueId);
  }
}

function scheduleBotPick(leagueId: number): void {
  if (activeDraftTimers.has(leagueId)) {
    clearTimeout(activeDraftTimers.get(leagueId)!);
  }

  // Bot pick pace: random integer from 4 to 18 seconds per pick.
  const randomSeconds = Math.floor(Math.random() * 15) + 4;
  const clampedWait = randomSeconds * 1000;

  const timer = setTimeout(() => {
    activeDraftTimers.delete(leagueId);
    makeBotPick(leagueId);
  }, clampedWait);

  activeDraftTimers.set(leagueId, timer);
}

async function completeDraft(leagueId: number, league: any): Promise<void> {
  await db.update(leagues).set({
    draftStatus: "completed",
    draftPickStartedAt: null,
  }).where(eq(leagues.id, leagueId));

  broadcastDraftEvent(leagueId, "draft-status", { draftStatus: "completed" });

  // Release bots from busy pool
  const lgTeams = await db.select({ userId: teams.userId })
    .from(teams).where(eq(teams.leagueId, leagueId));
  releaseBots(leagueId, lgTeams);

  activeDraftTimers.delete(leagueId);
  console.log(`[Bot Sim] Draft COMPLETED for league ${leagueId} ("${league.name}")`);
}

// ---------------------------------------------------------------------------
//  Position eligibility computation (mirrors routes.ts logic)
// ---------------------------------------------------------------------------

function computeEligiblePositions(
  league: { type?: string | null; rosterPositions?: string[] | null },
  teamPlayerPositions: string[],
): string[] {
  const isBestBall = league.type === "Best Ball";
  const rosterPositions = league.rosterPositions || [];

  if (isBestBall) {
    return ["C", "1B", "2B", "3B", "SS", "OF", "SP", "RP", "DH"];
  }

  const filledSlots = new Set<number>();
  for (const pos of teamPlayerPositions) {
    const idx = rosterPositions.findIndex((slot, i) => {
      if (filledSlots.has(i)) return false;
      if (slot === pos) return true;
      if (slot === "OF" && ["OF", "LF", "CF", "RF"].includes(pos)) return true;
      if (slot === "INF" && INF_POSITIONS.includes(pos)) return true;
      return false;
    });
    if (idx !== -1) {
      filledSlots.add(idx);
    } else {
      if (!["SP", "RP"].includes(pos)) {
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

  const emptySlots: string[] = [];
  for (let i = 0; i < rosterPositions.length; i++) {
    if (!filledSlots.has(i)) emptySlots.push(rosterPositions[i]);
  }

  const eligible: string[] = [];
  const hasBenchOrIL = emptySlots.some(s => s === "BN" || s === "IL");
  const hasUtil = emptySlots.some(s => s === "UT");
  const hasP = emptySlots.some(s => s === "P");
  const hasInf = emptySlots.some(s => s === "INF");

  for (const slot of emptySlots) {
    if (["BN", "IL", "UT", "P"].includes(slot)) continue;
    if (slot === "INF") {
      for (const p of INF_POSITIONS) if (!eligible.includes(p)) eligible.push(p);
      continue;
    }
    if (!eligible.includes(slot)) eligible.push(slot);
  }

  if (hasUtil) {
    for (const p of ["C", "1B", "2B", "3B", "SS", "OF", "DH"]) {
      if (!eligible.includes(p)) eligible.push(p);
    }
  }
  if (hasInf) {
    for (const p of INF_POSITIONS) if (!eligible.includes(p)) eligible.push(p);
  }
  if (hasP) {
    for (const p of ["SP", "RP"]) if (!eligible.includes(p)) eligible.push(p);
  }
  if (hasBenchOrIL) {
    for (const p of ["C", "1B", "2B", "3B", "SS", "OF", "SP", "RP", "DH"]) {
      if (!eligible.includes(p)) eligible.push(p);
    }
  }

  return eligible.length > 0 ? eligible : ["C", "1B", "2B", "3B", "SS", "OF", "SP", "RP", "DH"];
}

// ---------------------------------------------------------------------------
//  Player selection helpers
// ---------------------------------------------------------------------------

async function pickByAdp(
  excludeIds: number[],
  eligiblePositions: string[],
): Promise<{ id: number } | null> {
  const expandedPositions: string[] = [];
  for (const pos of eligiblePositions) {
    if (pos === "OF") {
      expandedPositions.push("OF", "LF", "CF", "RF");
    } else {
      expandedPositions.push(pos);
    }
  }
  const hasHitter = eligiblePositions.some(p => !["SP", "RP"].includes(p));
  if (hasHitter) {
    if (!expandedPositions.includes("UT")) expandedPositions.push("UT");
    if (!expandedPositions.includes("DH")) expandedPositions.push("DH");
  }
  const unique = [...new Set(expandedPositions)];

  const conds = [
    inArray(players.position, unique),
    ...(excludeIds.length > 0 ? [notInArray(players.id, excludeIds)] : []),
  ];

  const [player] = await db.select({ id: players.id }).from(players)
    .where(and(...conds))
    .orderBy(sql`COALESCE(${players.externalAdp}, 9999) ASC`, asc(players.name))
    .limit(1);

  return player || null;
}

async function pickFallback(
  excludeIds: number[],
  position?: string,
): Promise<{ id: number } | null> {
  const conds: any[] = [];
  if (excludeIds.length > 0) conds.push(notInArray(players.id, excludeIds));
  if (position) {
    if (position === "OF") {
      conds.push(inArray(players.position, ["OF", "LF", "CF", "RF"]));
    } else {
      conds.push(eq(players.position, position));
    }
  }

  const [player] = await db.select({ id: players.id }).from(players)
    .where(conds.length > 0 ? and(...conds) : undefined)
    .orderBy(desc(players.points), asc(players.name))
    .limit(1);

  return player || null;
}

// ---------------------------------------------------------------------------
//  Server restart recovery
// ---------------------------------------------------------------------------

async function recoverActiveDrafts(): Promise<void> {
  const activeDrafts = await db.select().from(leagues)
    .where(eq(leagues.draftStatus, "active"));

  for (const league of activeDrafts) {
    // Only resume bot-picking for leagues that have bot teams
    const lgTeams = await db.select({ userId: teams.userId })
      .from(teams).where(eq(teams.leagueId, league.id));
    const hasBots = lgTeams.some(t => t.userId && allBotIds.includes(t.userId));

    if (hasBots) {
      console.log(`[Bot Sim] Resuming draft for league ${league.id} ("${league.name}")`);
      scheduleBotPick(league.id);
    }
  }

  // Also check for leagues that are full and past draft time but never started
  const pending = await db.select().from(leagues).where(
    and(
      eq(leagues.isPublic, true),
      eq(leagues.draftStatus, "pending"),
      sql`${leagues.draftDate} IS NOT NULL AND ${leagues.draftDate} != ''`,
    )
  );

  for (const league of pending) {
    const draftTime = new Date(league.draftDate!).getTime();
    if (isNaN(draftTime) || Date.now() < draftTime) continue;

    const lgTeams = await db.select().from(teams).where(eq(teams.leagueId, league.id));
    const filled = lgTeams.filter(t => !t.isCpu).length;
    const maxT = league.maxTeams || league.numberOfTeams || 12;

    if (filled >= maxT) {
      console.log(`[Bot Sim] Recovery: league ${league.id} is full and past draft time, starting...`);
      // Will be picked up by the next checkBotDraftStarts cycle
    }
  }
}

// ---------------------------------------------------------------------------
//  Main entry point
// ---------------------------------------------------------------------------

let draftStartInterval: ReturnType<typeof setInterval> | null = null;

function isBotSimulationEnabled(): boolean {
  const raw = (process.env.BOT_SIMULATION_ENABLED || "").trim().toLowerCase();
  // Enabled by default unless explicitly disabled.
  if (!raw) return true;
  return ["1", "true", "yes", "on", "enabled"].includes(raw);
}

export async function startBotSimulation(): Promise<void> {
  if (!isBotSimulationEnabled()) {
    console.log(`[Bot Sim] Disabled by BOT_SIMULATION_ENABLED=${process.env.BOT_SIMULATION_ENABLED ?? "<unset>"}`);
    return;
  }

  console.log("[Bot Sim] Initializing...");
  console.log(`[Bot Sim] Config: creation λ=${LEAGUE_CREATION_LAMBDA}/s (avg ${Math.round(1/LEAGUE_CREATION_LAMBDA)}s), ` +
    `join λ=${BOT_JOIN_LAMBDA}/s (avg ${Math.round(1/BOT_JOIN_LAMBDA)}s), ` +
    `pick λ=${BOT_PICK_LAMBDA}/s (avg ${Math.round(1/BOT_PICK_LAMBDA)}s)`);
  console.log(`[Bot Sim] Zones: accel after ${ACCELERATION_THRESHOLD_MS/60000}min, hard cap at ${HARD_CAP_MS/60000}min`);
  console.log(`[Bot Sim] AUTO_LEAGUE_CREATION_ENABLED=${process.env.AUTO_LEAGUE_CREATION_ENABLED ?? "<unset>"} (effective=${isAutoLeagueCreationEnabled()})`);

  // Step 1: Seed bots
  await seedBots();

  // Step 2: Restore busy bot pool
  await restoreBusyBots();

  // Step 3: Recover active drafts
  await recoverActiveDrafts();

  if (isAutoLeagueCreationEnabled()) {
    // Step 3.5: Bootstrap at least one public pending league immediately so
    // users see activity right away after startup.
    const existingOpenPublic = await db.select({ id: leagues.id }).from(leagues).where(
      and(
        eq(leagues.isPublic, true),
        eq(leagues.draftStatus, "pending"),
      )
    );
    if (existingOpenPublic.length === 0) {
      await createBotLeague();
      lastLeagueCreationTime = Date.now();
    }
  } else {
    console.log("[Bot Sim] Auto-league creation is paused.");
  }

  // Step 4: Start the league creation scheduler (recursive setTimeout)
  if (isAutoLeagueCreationEnabled()) {
    scheduleNextLeagueCreation();
  }

  // Step 5: Start per-league bot join schedulers (independent Poisson process
  // for each eligible open public league).
  await reconcileLeagueJoinSchedulers();
  scheduleJoinReconcileLoop();

  // Step 6: Check for draft-ready leagues every 60 seconds
  draftStartInterval = setInterval(checkBotDraftStarts, 60_000);
  // Run once immediately on startup
  await checkBotDraftStarts();

  console.log("[Bot Sim] All schedulers running.");
}

export function stopBotSimulation(): void {
  if (leagueCreationTimer) clearTimeout(leagueCreationTimer);
  if (joinReconcileTimer) clearTimeout(joinReconcileTimer);
  for (const timer of leagueJoinTimers.values()) clearTimeout(timer);
  leagueJoinTimers.clear();
  leagueJoinNextFireAt.clear();
  lastLeagueJoinSuccessTime.clear();
  if (draftStartInterval) clearInterval(draftStartInterval);
  for (const timer of activeDraftTimers.values()) clearTimeout(timer);
  activeDraftTimers.clear();
  console.log("[Bot Sim] Stopped.");
}
