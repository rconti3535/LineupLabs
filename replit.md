# replit.md

## Overview

This is a **Fantasy Baseball** web application — a mobile-first platform inspired by the Sleeper app where users can create and manage fantasy baseball leagues, draft players, manage teams, track stats, and communicate with league members. The app features a dark theme UI with a bottom navigation bar designed for a mobile experience.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight client-side router)
- **State Management**: TanStack React Query for server state; local React state for UI
- **Styling**: Tailwind CSS with CSS variables for theming (dark mode by default, Sleeper-inspired design)
- **UI Components**: shadcn/ui (new-york style) built on Radix UI primitives
- **Forms**: React Hook Form with Zod resolvers for validation
- **Build Tool**: Vite
- **Path Aliases**: `@/` maps to `client/src/`, `@shared/` maps to `shared/`

The frontend is a single-page app rendered inside a mobile-optimized layout (max-width container with bottom navigation). Pages include: Landing, Login, Signup, Reset Password, Home, Teams, Messages, Profile, and Create League.

**Authentication** is simple client-side localStorage-based: the user ID is stored in localStorage and used to fetch the user profile via API. There is no session-based or token-based server auth — the `useAuth` hook manages login/logout by storing/clearing the user ID.

### Backend
- **Framework**: Express.js (Node.js) with TypeScript
- **Runtime**: tsx for development, esbuild for production bundling
- **API Pattern**: RESTful JSON API under `/api/` prefix
- **Dev Server**: Vite dev server is integrated as middleware in development; static files are served in production from `dist/public`

Key API routes:
- `GET /api/leagues/public` — fetch public leagues
- `GET /api/teams/user/:userId` — fetch teams for a user
- `GET /api/activities/user/:userId` — fetch user activities
- `GET /api/users/:id` — fetch user profile
- `POST /api/users` — create user (signup)
- `POST /api/auth/login` — login
- `POST /api/auth/reset-password` — reset password
- `POST /api/leagues` — create league
- `GET /api/players?q=&position=&level=&limit=&offset=` — search/filter players
- `GET /api/players/:id` — fetch player by ID
- `GET /api/adp?type=&scoring=&season=&limit=&offset=` — fetch ADP rankings
- `GET /api/adp/player/:playerId?type=&scoring=&season=` — fetch single player ADP
- `POST /api/adp/recalculate` — manually trigger ADP recalculation
- `POST /api/leagues/:id/auto-pick` — server auto-picks best available player
- `POST /api/leagues/:id/draft-control` — commissioner start/pause/resume draft
- `POST /api/leagues/:id/roster-swap` — swap two players' roster positions (with position eligibility validation)
- `POST /api/leagues/:id/init-roster-slots` — initialize persisted roster slot assignments after draft completion
- `GET /api/leagues/:id/standings` — compute and return Roto standings with category values, points, and rankings
- `GET /api/leagues/:id/waivers` — fetch active waivers with player info and claim counts
- `GET /api/leagues/:id/my-claims?userId=` — fetch user's outstanding waiver claims with player info
- `POST /api/leagues/:id/waiver-claim` — submit a waiver claim on a player

### Data Storage
- **Database**: PostgreSQL (via Neon serverless driver `@neondatabase/serverless`)
- **ORM**: Drizzle ORM with `drizzle-zod` for schema-to-validation integration
- **Schema Location**: `shared/schema.ts` — shared between client and server
- **Migrations**: Drizzle Kit with `drizzle-kit push` for schema sync (migrations output to `./migrations`)
- **Connection**: Requires `DATABASE_URL` environment variable

### Database Schema (defined in `shared/schema.ts`)
- **users** — id, username, email, password, name, avatar, leagues count, wins, championships
- **leagues** — id, name, description, type, numberOfTeams, scoringFormat, hittingCategories (text array, default R/HR/RBI/SB/AVG), pitchingCategories (text array, default W/SV/K/ERA/WHIP), isPublic, maxTeams, currentTeams, buyin, prize, status, rosterPositions, draftType, draftDate, secondsPerPick, draftOrder, draftStatus (pending/active/paused/completed), draftPickStartedAt (ISO timestamp for server-side timer), createdBy (FK to users), createdAt
- **teams** — id, name, leagueId (FK to leagues), userId (FK to users), wins, losses, points, rank, logo, nextOpponent
- **players** — id, mlbId (unique), name, firstName, lastName, position, team, teamAbbreviation, jerseyNumber, bats, throws, age, height, weight, mlbLevel (MLB/AAA/AA/A+/A/Rookie), avatar, points, status. ~8,200 real players imported from MLB Stats API.
- **draft_picks** — id, leagueId (FK to leagues), teamId (FK to teams), playerId (FK to players), overallPick, round, pickInRound, pickedAt, rosterSlot (nullable integer for persisted lineup position). Tracks all draft selections per league.
- **player_adp** — id, playerId (FK to players), leagueType, scoringFormat, season, adp (average draft position), draftCount, totalPositionSum. Recalculated when drafts complete. Undrafted players get position 9999.
- **waivers** — id, leagueId (FK to leagues), playerId (FK to players), droppedByTeamId (FK to teams), waiverExpiresAt (ISO string), status (active/claimed/cleared), createdAt. 2-day waiver period for dropped players.
- **waiver_claims** — id, waiverId (FK to waivers), teamId (FK to teams), dropPickId (nullable FK to draft_picks), createdAt. Teams submit claims on waiver players; first claim wins when waiver expires. dropPickId tracks which player to drop when roster is full.
- **activities** — user activity tracking

### Storage Layer
- `server/storage.ts` defines an `IStorage` interface and `DatabaseStorage` class implementing all CRUD operations using Drizzle ORM
- The storage pattern allows for easy swapping of implementations

### Key Design Decisions
1. **Shared schema between client and server** — The `shared/` directory contains the Drizzle schema and Zod insert schemas, used both for DB operations and client-side form validation
2. **Mobile-first design** — The entire UI is built for mobile viewport with a fixed bottom navigation bar
3. **Dark theme only** — CSS variables are set for a dark color scheme inspired by the Sleeper fantasy sports app
4. **No server-side auth sessions** — Authentication is purely client-side via localStorage (passwords are stored in the DB but there's no bcrypt hashing visible in the current code — this should be added)
5. **Mock data available** — `client/src/lib/mock-data.ts` contains sample data for development/testing

## External Dependencies

### Database
- **PostgreSQL** via Neon Serverless (`@neondatabase/serverless`) — requires `DATABASE_URL` environment variable
- **connect-pg-simple** — listed as dependency (likely for session store, though not currently wired up)

### Key NPM Packages
- **drizzle-orm** + **drizzle-kit** — ORM and migration tooling
- **drizzle-zod** — Generate Zod schemas from Drizzle table definitions
- **express** — HTTP server framework
- **@tanstack/react-query** — Server state management
- **react-hook-form** + **@hookform/resolvers** — Form handling with Zod validation
- **wouter** — Client-side routing
- **shadcn/ui components** — Full suite of Radix-based UI primitives (dialog, dropdown, tabs, toast, etc.)
- **tailwindcss** — Utility-first CSS framework
- **lucide-react** — Icon library
- **date-fns** — Date utility library
- **nanoid** — Unique ID generation
- **vaul** — Drawer component
- **recharts** — Charting library
- **embla-carousel-react** — Carousel component

### Fonts
- **Jura** — Google Fonts, loaded via CDN in `client/index.html`

### Replit-specific
- **@replit/vite-plugin-runtime-error-modal** — Runtime error overlay in development
- **@replit/vite-plugin-cartographer** — Replit development tooling (conditionally loaded)