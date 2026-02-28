CREATE TABLE IF NOT EXISTS "weekly_bestball_roto_points" (
  "id" serial PRIMARY KEY NOT NULL,
  "league_id" integer NOT NULL REFERENCES "leagues"("id"),
  "team_id" integer NOT NULL REFERENCES "teams"("id"),
  "week_start" text NOT NULL,
  "week_end" text NOT NULL,
  "week_number" integer NOT NULL,
  "category_values" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "category_points" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "total_points" real DEFAULT 0 NOT NULL,
  "finalized_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "weekly_bestball_roto_points_unique"
  ON "weekly_bestball_roto_points" ("league_id", "team_id", "week_start");

CREATE INDEX IF NOT EXISTS "weekly_bestball_roto_points_league_week_idx"
  ON "weekly_bestball_roto_points" ("league_id", "week_start");

CREATE INDEX IF NOT EXISTS "weekly_bestball_roto_points_team_week_idx"
  ON "weekly_bestball_roto_points" ("team_id", "week_start");

CREATE TABLE IF NOT EXISTS "weekly_player_stat_snapshots" (
  "id" serial PRIMARY KEY NOT NULL,
  "player_id" integer NOT NULL REFERENCES "players"("id"),
  "week_start" text NOT NULL,
  "cumulative_stats" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "captured_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "weekly_player_stat_snapshots_unique"
  ON "weekly_player_stat_snapshots" ("player_id", "week_start");

CREATE INDEX IF NOT EXISTS "weekly_player_stat_snapshots_week_idx"
  ON "weekly_player_stat_snapshots" ("week_start");

CREATE INDEX IF NOT EXISTS "weekly_player_stat_snapshots_player_idx"
  ON "weekly_player_stat_snapshots" ("player_id");
