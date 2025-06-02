import { 
  users, leagues, teams, players, activities,
  type User, type InsertUser,
  type League, type InsertLeague,
  type Team, type InsertTeam,
  type Player, type InsertPlayer,
  type Activity, type InsertActivity
} from "@shared/schema";

export interface IStorage {
  // Users
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Leagues
  getLeagues(): Promise<League[]>;
  getPublicLeagues(): Promise<League[]>;
  getLeague(id: number): Promise<League | undefined>;
  createLeague(league: InsertLeague): Promise<League>;
  
  // Teams
  getTeamsByUserId(userId: number): Promise<Team[]>;
  getTeamsByLeagueId(leagueId: number): Promise<Team[]>;
  getTeam(id: number): Promise<Team | undefined>;
  createTeam(team: InsertTeam): Promise<Team>;
  
  // Players
  getPlayers(): Promise<Player[]>;
  getPlayer(id: number): Promise<Player | undefined>;
  createPlayer(player: InsertPlayer): Promise<Player>;
  
  // Activities
  getActivitiesByUserId(userId: number): Promise<Activity[]>;
  createActivity(activity: InsertActivity): Promise<Activity>;
}

export class MemStorage implements IStorage {
  private users: Map<number, User> = new Map();
  private leagues: Map<number, League> = new Map();
  private teams: Map<number, Team> = new Map();
  private players: Map<number, Player> = new Map();
  private activities: Map<number, Activity> = new Map();
  
  private currentUserId = 1;
  private currentLeagueId = 1;
  private currentTeamId = 1;
  private currentPlayerId = 1;
  private currentActivityId = 1;

  constructor() {
    this.seedData();
  }

  private seedData() {
    // Seed users
    const user: User = {
      id: 1,
      username: "alexrod",
      email: "alex.rodriguez@email.com",
      password: "password",
      name: "Alex Rodriguez",
      avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=80&h=80",
      leagues: 5,
      wins: 23,
      championships: 2,
    };
    this.users.set(1, user);
    this.currentUserId = 2;

    // Seed leagues
    const league1: League = {
      id: 1,
      name: "Championship Series",
      description: "Competitive league for serious players",
      isPublic: true,
      maxTeams: 12,
      currentTeams: 8,
      buyin: "$50",
      prize: "$600",
      status: "Open",
      createdBy: 1,
      createdAt: new Date(),
    };
    
    const league2: League = {
      id: 2,
      name: "Rookie League",
      description: "Perfect for beginners",
      isPublic: true,
      maxTeams: 10,
      currentTeams: 6,
      buyin: "Free",
      prize: "Trophy",
      status: "Open",
      createdBy: 1,
      createdAt: new Date(),
    };
    
    this.leagues.set(1, league1);
    this.leagues.set(2, league2);
    this.currentLeagueId = 3;

    // Seed teams
    const team1: Team = {
      id: 1,
      name: "Sluggers United",
      leagueId: 1,
      userId: 1,
      wins: 12,
      losses: 3,
      points: 1847,
      rank: 2,
      logo: "https://pixabay.com/get/g32fe1452b7a64990a9d7a590cd92c37bf37a9a7b9a26cc3eb1724c3444ce68e2c9d47a18001cdf1a316e20385dd2b22e83102457fe0fbd24dde96ab0e450a14a_1280.jpg",
      nextOpponent: "Team B",
    };
    
    const team2: Team = {
      id: 2,
      name: "Diamond Kings",
      leagueId: 2,
      userId: 1,
      wins: 8,
      losses: 7,
      points: 1456,
      rank: 5,
      logo: "https://images.unsplash.com/photo-1518611012118-696072aa579a?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=60&h=60",
      nextOpponent: "Aces",
    };
    
    this.teams.set(1, team1);
    this.teams.set(2, team2);
    this.currentTeamId = 3;

    // Seed activities
    const activity1: Activity = {
      id: 1,
      userId: 1,
      message: "Mike Trout scored 15 points in your league",
      time: "2 hours ago",
      avatar: "https://images.unsplash.com/photo-1566577739112-5180d4bf9390?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=60&h=60",
    };
    
    const activity2: Activity = {
      id: 2,
      userId: 1,
      message: 'Your league "Home Run Heroes" starts tomorrow',
      time: "5 hours ago",
      avatar: "https://images.unsplash.com/photo-1578662996442-48f60103fc96?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=60&h=60",
    };
    
    this.activities.set(1, activity1);
    this.activities.set(2, activity2);
    this.currentActivityId = 3;
  }

  // Users
  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(user => user.username === username);
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.currentUserId++;
    const user: User = { ...insertUser, id, leagues: 0, wins: 0, championships: 0 };
    this.users.set(id, user);
    return user;
  }

  // Leagues
  async getLeagues(): Promise<League[]> {
    return Array.from(this.leagues.values());
  }

  async getPublicLeagues(): Promise<League[]> {
    return Array.from(this.leagues.values()).filter(league => league.isPublic);
  }

  async getLeague(id: number): Promise<League | undefined> {
    return this.leagues.get(id);
  }

  async createLeague(insertLeague: InsertLeague): Promise<League> {
    const id = this.currentLeagueId++;
    const league: League = { 
      ...insertLeague, 
      id, 
      currentTeams: 0, 
      createdAt: new Date() 
    };
    this.leagues.set(id, league);
    return league;
  }

  // Teams
  async getTeamsByUserId(userId: number): Promise<Team[]> {
    return Array.from(this.teams.values()).filter(team => team.userId === userId);
  }

  async getTeamsByLeagueId(leagueId: number): Promise<Team[]> {
    return Array.from(this.teams.values()).filter(team => team.leagueId === leagueId);
  }

  async getTeam(id: number): Promise<Team | undefined> {
    return this.teams.get(id);
  }

  async createTeam(insertTeam: InsertTeam): Promise<Team> {
    const id = this.currentTeamId++;
    const team: Team = { 
      ...insertTeam, 
      id, 
      wins: 0, 
      losses: 0, 
      points: 0, 
      rank: 1 
    };
    this.teams.set(id, team);
    return team;
  }

  // Players
  async getPlayers(): Promise<Player[]> {
    return Array.from(this.players.values());
  }

  async getPlayer(id: number): Promise<Player | undefined> {
    return this.players.get(id);
  }

  async createPlayer(insertPlayer: InsertPlayer): Promise<Player> {
    const id = this.currentPlayerId++;
    const player: Player = { ...insertPlayer, id, points: 0 };
    this.players.set(id, player);
    return player;
  }

  // Activities
  async getActivitiesByUserId(userId: number): Promise<Activity[]> {
    return Array.from(this.activities.values()).filter(activity => activity.userId === userId);
  }

  async createActivity(insertActivity: InsertActivity): Promise<Activity> {
    const id = this.currentActivityId++;
    const activity: Activity = { ...insertActivity, id };
    this.activities.set(id, activity);
    return activity;
  }
}

export const storage = new MemStorage();
