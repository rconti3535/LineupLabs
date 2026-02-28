CREATE TABLE IF NOT EXISTS "weekly_bestball_points" (
  "id" serial PRIMARY KEY NOT NULL,
  "league_id" integer NOT NULL REFERENCES "leagues"("id"),
  "team_id" integer NOT NULL REFERENCES "teams"("id"),
  "week_start" text NOT NULL,
  "week_end" text NOT NULL,
  "week_number" integer NOT NULL,
  "weekly_points" real DEFAULT 0 NOT NULL,
  "cumulative_points" real DEFAULT 0 NOT NULL,
  "finalized_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "weekly_bestball_points_unique"
  ON "weekly_bestball_points" ("league_id", "team_id", "week_start");

CREATE INDEX IF NOT EXISTS "weekly_bestball_points_league_week_idx"
  ON "weekly_bestball_points" ("league_id", "week_start");

CREATE INDEX IF NOT EXISTS "weekly_bestball_points_team_week_idx"
  ON "weekly_bestball_points" ("team_id", "week_start");
