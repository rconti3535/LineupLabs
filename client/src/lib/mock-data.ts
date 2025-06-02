import type { League, Team, Activity, User, Player } from "@shared/schema";

export const mockUser: User = {
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

export const mockLeagues: League[] = [
  {
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
  },
  {
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
  },
];

export const mockTeams: Team[] = [
  {
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
  },
  {
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
  },
];

export const mockActivities: Activity[] = [
  {
    id: 1,
    userId: 1,
    message: "Mike Trout scored 15 points in your league",
    time: "2 hours ago",
    avatar: "https://images.unsplash.com/photo-1566577739112-5180d4bf9390?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=60&h=60",
  },
  {
    id: 2,
    userId: 1,
    message: 'Your league "Home Run Heroes" starts tomorrow',
    time: "5 hours ago",
    avatar: "https://images.unsplash.com/photo-1578662996442-48f60103fc96?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=60&h=60",
  },
];

export const mockPlayers: Player[] = [
  {
    id: 1,
    name: "Mike Trout",
    position: "OF",
    team: "LAA",
    avatar: "https://images.unsplash.com/photo-1566577739112-5180d4bf9390?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=60&h=60",
    points: 15,
  },
  {
    id: 2,
    name: "Shohei Ohtani",
    position: "DH/P",
    team: "LAD",
    avatar: "https://images.unsplash.com/photo-1566577739112-5180d4bf9390?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=60&h=60",
    points: 22,
  },
];
