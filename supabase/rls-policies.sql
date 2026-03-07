-- Supabase RLS policy baseline for LineupLabs
-- ------------------------------------------------------------
-- IMPORTANT:
-- 1) This assumes your JWT includes claim: app_user_id (integer, maps to public.users.id)
-- 2) If app_user_id is missing, policies deny access by default.
-- 3) Your backend service role can still bypass RLS for server-side operations.
-- 4) Run this in Supabase SQL Editor.

begin;

-- Helper: read app user id from JWT claims safely.
create or replace function public.current_app_user_id()
returns integer
language plpgsql
stable
as $$
declare
  claims_text text;
  claims jsonb;
  raw_id text;
begin
  claims_text := current_setting('request.jwt.claims', true);
  if claims_text is null or claims_text = '' then
    return null;
  end if;

  claims := claims_text::jsonb;
  raw_id := claims ->> 'app_user_id';
  if raw_id is null or raw_id = '' then
    return null;
  end if;

  return raw_id::integer;
exception when others then
  return null;
end;
$$;

-- Enable + force RLS on user/data tables.
alter table if exists public.users enable row level security;
alter table if exists public.leagues enable row level security;
alter table if exists public.teams enable row level security;
alter table if exists public.draft_picks enable row level security;
alter table if exists public.activities enable row level security;
alter table if exists public.league_transactions enable row level security;
alter table if exists public.waivers enable row level security;
alter table if exists public.waiver_claims enable row level security;
alter table if exists public.daily_lineups enable row level security;
alter table if exists public.league_matchups enable row level security;
alter table if exists public.weekly_bestball_points enable row level security;
alter table if exists public.weekly_bestball_roto_points enable row level security;
alter table if exists public.bot_state enable row level security;

alter table if exists public.users force row level security;
alter table if exists public.leagues force row level security;
alter table if exists public.teams force row level security;
alter table if exists public.draft_picks force row level security;
alter table if exists public.activities force row level security;
alter table if exists public.league_transactions force row level security;
alter table if exists public.waivers force row level security;
alter table if exists public.waiver_claims force row level security;
alter table if exists public.daily_lineups force row level security;
alter table if exists public.league_matchups force row level security;
alter table if exists public.weekly_bestball_points force row level security;
alter table if exists public.weekly_bestball_roto_points force row level security;
alter table if exists public.bot_state force row level security;

-- USERS (own row only)
drop policy if exists users_select_own on public.users;
drop policy if exists users_update_own on public.users;
drop policy if exists users_delete_own on public.users;

create policy users_select_own on public.users
for select
to authenticated
using (id = public.current_app_user_id());

create policy users_update_own on public.users
for update
to authenticated
using (id = public.current_app_user_id())
with check (id = public.current_app_user_id());

create policy users_delete_own on public.users
for delete
to authenticated
using (id = public.current_app_user_id());

-- LEAGUES (commissioner write; members can read)
drop policy if exists leagues_select_member_or_owner on public.leagues;
drop policy if exists leagues_insert_owner on public.leagues;
drop policy if exists leagues_update_owner on public.leagues;
drop policy if exists leagues_delete_owner on public.leagues;

create policy leagues_select_member_or_owner on public.leagues
for select
to authenticated
using (
  created_by = public.current_app_user_id()
  or exists (
    select 1 from public.teams t
    where t.league_id = leagues.id
      and t.user_id = public.current_app_user_id()
  )
);

create policy leagues_insert_owner on public.leagues
for insert
to authenticated
with check (created_by = public.current_app_user_id());

create policy leagues_update_owner on public.leagues
for update
to authenticated
using (created_by = public.current_app_user_id())
with check (created_by = public.current_app_user_id());

create policy leagues_delete_owner on public.leagues
for delete
to authenticated
using (created_by = public.current_app_user_id());

-- TEAMS (own team write; league members read)
drop policy if exists teams_select_member_or_owner on public.teams;
drop policy if exists teams_insert_own on public.teams;
drop policy if exists teams_update_own on public.teams;
drop policy if exists teams_delete_own on public.teams;

create policy teams_select_member_or_owner on public.teams
for select
to authenticated
using (
  user_id = public.current_app_user_id()
  or exists (
    select 1 from public.teams me
    where me.league_id = teams.league_id
      and me.user_id = public.current_app_user_id()
  )
);

create policy teams_insert_own on public.teams
for insert
to authenticated
with check (user_id = public.current_app_user_id());

create policy teams_update_own on public.teams
for update
to authenticated
using (user_id = public.current_app_user_id())
with check (user_id = public.current_app_user_id());

create policy teams_delete_own on public.teams
for delete
to authenticated
using (user_id = public.current_app_user_id());

-- DRAFT PICKS (read/write only for rows tied to own team)
drop policy if exists draft_picks_select_own_team on public.draft_picks;
drop policy if exists draft_picks_insert_own_team on public.draft_picks;
drop policy if exists draft_picks_update_own_team on public.draft_picks;
drop policy if exists draft_picks_delete_own_team on public.draft_picks;

create policy draft_picks_select_own_team on public.draft_picks
for select
to authenticated
using (
  exists (
    select 1 from public.teams t
    where t.id = draft_picks.team_id
      and t.user_id = public.current_app_user_id()
  )
);

create policy draft_picks_insert_own_team on public.draft_picks
for insert
to authenticated
with check (
  exists (
    select 1 from public.teams t
    where t.id = draft_picks.team_id
      and t.user_id = public.current_app_user_id()
  )
);

create policy draft_picks_update_own_team on public.draft_picks
for update
to authenticated
using (
  exists (
    select 1 from public.teams t
    where t.id = draft_picks.team_id
      and t.user_id = public.current_app_user_id()
  )
)
with check (
  exists (
    select 1 from public.teams t
    where t.id = draft_picks.team_id
      and t.user_id = public.current_app_user_id()
  )
);

create policy draft_picks_delete_own_team on public.draft_picks
for delete
to authenticated
using (
  exists (
    select 1 from public.teams t
    where t.id = draft_picks.team_id
      and t.user_id = public.current_app_user_id()
  )
);

-- ACTIVITIES (own rows only)
drop policy if exists activities_select_own on public.activities;
drop policy if exists activities_insert_own on public.activities;
drop policy if exists activities_update_own on public.activities;
drop policy if exists activities_delete_own on public.activities;

create policy activities_select_own on public.activities
for select
to authenticated
using (user_id = public.current_app_user_id());

create policy activities_insert_own on public.activities
for insert
to authenticated
with check (user_id = public.current_app_user_id());

create policy activities_update_own on public.activities
for update
to authenticated
using (user_id = public.current_app_user_id())
with check (user_id = public.current_app_user_id());

create policy activities_delete_own on public.activities
for delete
to authenticated
using (user_id = public.current_app_user_id());

-- LEAGUE TRANSACTIONS (league members read; own-team writes)
drop policy if exists league_tx_select_member on public.league_transactions;
drop policy if exists league_tx_insert_own_team on public.league_transactions;
drop policy if exists league_tx_update_own_team on public.league_transactions;
drop policy if exists league_tx_delete_own_team on public.league_transactions;

create policy league_tx_select_member on public.league_transactions
for select
to authenticated
using (
  exists (
    select 1 from public.teams me
    where me.league_id = league_transactions.league_id
      and me.user_id = public.current_app_user_id()
  )
);

create policy league_tx_insert_own_team on public.league_transactions
for insert
to authenticated
with check (
  exists (
    select 1 from public.teams t
    where t.id = league_transactions.team_id
      and t.user_id = public.current_app_user_id()
  )
);

create policy league_tx_update_own_team on public.league_transactions
for update
to authenticated
using (
  exists (
    select 1 from public.teams t
    where t.id = league_transactions.team_id
      and t.user_id = public.current_app_user_id()
  )
)
with check (
  exists (
    select 1 from public.teams t
    where t.id = league_transactions.team_id
      and t.user_id = public.current_app_user_id()
  )
);

create policy league_tx_delete_own_team on public.league_transactions
for delete
to authenticated
using (
  exists (
    select 1 from public.teams t
    where t.id = league_transactions.team_id
      and t.user_id = public.current_app_user_id()
  )
);

-- WAIVERS (league members read; dropped_by_team owner writes)
drop policy if exists waivers_select_member on public.waivers;
drop policy if exists waivers_insert_own_team on public.waivers;
drop policy if exists waivers_update_own_team on public.waivers;
drop policy if exists waivers_delete_own_team on public.waivers;

create policy waivers_select_member on public.waivers
for select
to authenticated
using (
  exists (
    select 1 from public.teams me
    where me.league_id = waivers.league_id
      and me.user_id = public.current_app_user_id()
  )
);

create policy waivers_insert_own_team on public.waivers
for insert
to authenticated
with check (
  exists (
    select 1 from public.teams t
    where t.id = waivers.dropped_by_team_id
      and t.user_id = public.current_app_user_id()
  )
);

create policy waivers_update_own_team on public.waivers
for update
to authenticated
using (
  exists (
    select 1 from public.teams t
    where t.id = waivers.dropped_by_team_id
      and t.user_id = public.current_app_user_id()
  )
)
with check (
  exists (
    select 1 from public.teams t
    where t.id = waivers.dropped_by_team_id
      and t.user_id = public.current_app_user_id()
  )
);

create policy waivers_delete_own_team on public.waivers
for delete
to authenticated
using (
  exists (
    select 1 from public.teams t
    where t.id = waivers.dropped_by_team_id
      and t.user_id = public.current_app_user_id()
  )
);

-- WAIVER CLAIMS (own-team rows only)
drop policy if exists waiver_claims_select_own_team on public.waiver_claims;
drop policy if exists waiver_claims_insert_own_team on public.waiver_claims;
drop policy if exists waiver_claims_update_own_team on public.waiver_claims;
drop policy if exists waiver_claims_delete_own_team on public.waiver_claims;

create policy waiver_claims_select_own_team on public.waiver_claims
for select
to authenticated
using (
  exists (
    select 1 from public.teams t
    where t.id = waiver_claims.team_id
      and t.user_id = public.current_app_user_id()
  )
);

create policy waiver_claims_insert_own_team on public.waiver_claims
for insert
to authenticated
with check (
  exists (
    select 1 from public.teams t
    where t.id = waiver_claims.team_id
      and t.user_id = public.current_app_user_id()
  )
);

create policy waiver_claims_update_own_team on public.waiver_claims
for update
to authenticated
using (
  exists (
    select 1 from public.teams t
    where t.id = waiver_claims.team_id
      and t.user_id = public.current_app_user_id()
  )
)
with check (
  exists (
    select 1 from public.teams t
    where t.id = waiver_claims.team_id
      and t.user_id = public.current_app_user_id()
  )
);

create policy waiver_claims_delete_own_team on public.waiver_claims
for delete
to authenticated
using (
  exists (
    select 1 from public.teams t
    where t.id = waiver_claims.team_id
      and t.user_id = public.current_app_user_id()
  )
);

-- DAILY LINEUPS (own-team rows only)
drop policy if exists daily_lineups_select_own_team on public.daily_lineups;
drop policy if exists daily_lineups_insert_own_team on public.daily_lineups;
drop policy if exists daily_lineups_update_own_team on public.daily_lineups;
drop policy if exists daily_lineups_delete_own_team on public.daily_lineups;

create policy daily_lineups_select_own_team on public.daily_lineups
for select
to authenticated
using (
  exists (
    select 1 from public.teams t
    where t.id = daily_lineups.team_id
      and t.user_id = public.current_app_user_id()
  )
);

create policy daily_lineups_insert_own_team on public.daily_lineups
for insert
to authenticated
with check (
  exists (
    select 1 from public.teams t
    where t.id = daily_lineups.team_id
      and t.user_id = public.current_app_user_id()
  )
);

create policy daily_lineups_update_own_team on public.daily_lineups
for update
to authenticated
using (
  exists (
    select 1 from public.teams t
    where t.id = daily_lineups.team_id
      and t.user_id = public.current_app_user_id()
  )
)
with check (
  exists (
    select 1 from public.teams t
    where t.id = daily_lineups.team_id
      and t.user_id = public.current_app_user_id()
  )
);

create policy daily_lineups_delete_own_team on public.daily_lineups
for delete
to authenticated
using (
  exists (
    select 1 from public.teams t
    where t.id = daily_lineups.team_id
      and t.user_id = public.current_app_user_id()
  )
);

-- LEAGUE MATCHUPS (league members read-only)
drop policy if exists league_matchups_select_member on public.league_matchups;

create policy league_matchups_select_member on public.league_matchups
for select
to authenticated
using (
  exists (
    select 1 from public.teams me
    where me.league_id = league_matchups.league_id
      and me.user_id = public.current_app_user_id()
  )
);

-- WEEKLY BESTBALL POINTS (own-team rows only)
drop policy if exists weekly_bb_points_select_own_team on public.weekly_bestball_points;
create policy weekly_bb_points_select_own_team on public.weekly_bestball_points
for select
to authenticated
using (
  exists (
    select 1 from public.teams t
    where t.id = weekly_bestball_points.team_id
      and t.user_id = public.current_app_user_id()
  )
);

drop policy if exists weekly_bb_roto_select_own_team on public.weekly_bestball_roto_points;
create policy weekly_bb_roto_select_own_team on public.weekly_bestball_roto_points
for select
to authenticated
using (
  exists (
    select 1 from public.teams t
    where t.id = weekly_bestball_roto_points.team_id
      and t.user_id = public.current_app_user_id()
  )
);

-- BOT STATE (deny browser access)
drop policy if exists bot_state_no_access on public.bot_state;
create policy bot_state_no_access on public.bot_state
for all
to authenticated
using (false)
with check (false);

commit;

-- ------------------------------------------------------------
-- Verification queries (run after applying):
-- ------------------------------------------------------------
-- select schemaname, tablename, rowsecurity, forcerowsecurity
-- from pg_tables
-- where schemaname='public'
-- order by tablename;
--
-- select schemaname, tablename, policyname, cmd, qual, with_check
-- from pg_policies
-- where schemaname='public'
-- order by tablename, policyname;
