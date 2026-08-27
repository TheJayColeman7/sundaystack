-- Phase 0.1 foundation: sports data + user profiles.
-- Requires Supabase (auth schema). Apply via `supabase start` / `supabase db reset`
-- or run against a cloud project.

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- users (profile; id matches auth.users)
-- ---------------------------------------------------------------------------

create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger users_set_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- sports
-- ---------------------------------------------------------------------------

create table public.sports (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger sports_set_updated_at
  before update on public.sports
  for each row execute function public.set_updated_at();

insert into public.sports (code, name)
values ('nfl', 'National Football League');

-- ---------------------------------------------------------------------------
-- teams
-- ---------------------------------------------------------------------------

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  sport_id uuid not null references public.sports (id),
  abbreviation text not null,
  name text not null,
  city text,
  conference text,
  division text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sport_id, abbreviation)
);

create index teams_sport_id_idx on public.teams (sport_id);

create trigger teams_set_updated_at
  before update on public.teams
  for each row execute function public.set_updated_at();

create table public.team_external_ids (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  provider text not null,
  external_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, external_id)
);

create index team_external_ids_team_id_idx on public.team_external_ids (team_id);

create trigger team_external_ids_set_updated_at
  before update on public.team_external_ids
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- players
-- ---------------------------------------------------------------------------

create table public.players (
  id uuid primary key default gen_random_uuid(),
  sport_id uuid not null references public.sports (id),
  team_id uuid references public.teams (id) on delete set null,
  first_name text not null,
  last_name text not null,
  display_name text not null,
  position text not null,
  jersey_number integer,
  status text,
  headshot_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index players_sport_id_idx on public.players (sport_id);
create index players_team_id_idx on public.players (team_id);
create index players_position_idx on public.players (position);
create index players_display_name_trgm_idx
  on public.players using gin (display_name gin_trgm_ops);
create index players_last_name_trgm_idx
  on public.players using gin (last_name gin_trgm_ops);

create trigger players_set_updated_at
  before update on public.players
  for each row execute function public.set_updated_at();

create table public.player_external_ids (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id) on delete cascade,
  provider text not null,
  external_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, external_id)
);

create index player_external_ids_player_id_idx on public.player_external_ids (player_id);

create trigger player_external_ids_set_updated_at
  before update on public.player_external_ids
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- seasons / games
-- ---------------------------------------------------------------------------

create table public.seasons (
  id uuid primary key default gen_random_uuid(),
  sport_id uuid not null references public.sports (id),
  year integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sport_id, year)
);

create trigger seasons_set_updated_at
  before update on public.seasons
  for each row execute function public.set_updated_at();

create table public.games (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons (id),
  week integer not null,
  season_type text not null,
  home_team_id uuid not null references public.teams (id),
  away_team_id uuid not null references public.teams (id),
  kickoff_at timestamptz,
  status text not null,
  home_score integer,
  away_score integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (season_id, week, season_type, home_team_id, away_team_id),
  constraint games_week_positive check (week >= 0),
  constraint games_season_type_check check (season_type in ('PRE', 'REG', 'POST')),
  constraint games_status_check check (status in ('scheduled', 'in_progress', 'final', 'cancelled')),
  constraint games_distinct_teams check (home_team_id <> away_team_id)
);

create index games_season_week_idx on public.games (season_id, week);
create index games_home_team_id_idx on public.games (home_team_id);
create index games_away_team_id_idx on public.games (away_team_id);

create trigger games_set_updated_at
  before update on public.games
  for each row execute function public.set_updated_at();

create table public.game_external_ids (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  provider text not null,
  external_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, external_id)
);

create index game_external_ids_game_id_idx on public.game_external_ids (game_id);

create trigger game_external_ids_set_updated_at
  before update on public.game_external_ids
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- player_game_stats (counting stats only; no fantasy points)
-- ---------------------------------------------------------------------------

create table public.player_game_stats (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id),
  game_id uuid not null references public.games (id),
  season_id uuid not null references public.seasons (id),
  team_id uuid references public.teams (id),
  week integer not null,
  completions integer not null default 0,
  attempts integer not null default 0,
  passing_yards integer not null default 0,
  passing_tds integer not null default 0,
  interceptions integer not null default 0,
  sacks integer not null default 0,
  sack_yards integer not null default 0,
  passing_two_point_conversions integer not null default 0,
  rushing_attempts integer not null default 0,
  rushing_yards integer not null default 0,
  rushing_tds integer not null default 0,
  rushing_two_point_conversions integer not null default 0,
  targets integer not null default 0,
  receptions integer not null default 0,
  receiving_yards integer not null default 0,
  receiving_tds integer not null default 0,
  receiving_two_point_conversions integer not null default 0,
  rushing_fumbles integer not null default 0,
  rushing_fumbles_lost integer not null default 0,
  receiving_fumbles integer not null default 0,
  receiving_fumbles_lost integer not null default 0,
  sack_fumbles integer not null default 0,
  sack_fumbles_lost integer not null default 0,
  field_goals_made integer not null default 0,
  field_goals_attempted integer not null default 0,
  field_goals_made_0_19 integer not null default 0,
  field_goals_made_20_29 integer not null default 0,
  field_goals_made_30_39 integer not null default 0,
  field_goals_made_40_49 integer not null default 0,
  field_goals_made_50_plus integer not null default 0,
  extra_points_made integer not null default 0,
  extra_points_attempted integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (player_id, game_id)
);

create index player_game_stats_player_id_idx on public.player_game_stats (player_id);
create index player_game_stats_game_id_idx on public.player_game_stats (game_id);
create index player_game_stats_season_week_idx on public.player_game_stats (season_id, week);

create trigger player_game_stats_set_updated_at
  before update on public.player_game_stats
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.users enable row level security;
alter table public.sports enable row level security;
alter table public.teams enable row level security;
alter table public.team_external_ids enable row level security;
alter table public.players enable row level security;
alter table public.player_external_ids enable row level security;
alter table public.seasons enable row level security;
alter table public.games enable row level security;
alter table public.game_external_ids enable row level security;
alter table public.player_game_stats enable row level security;

create policy users_select_own on public.users
  for select using (auth.uid() = id);

create policy users_update_own on public.users
  for update using (auth.uid() = id);

create policy sports_select_public on public.sports
  for select to anon, authenticated using (true);

create policy teams_select_public on public.teams
  for select to anon, authenticated using (true);

create policy team_external_ids_select_public on public.team_external_ids
  for select to anon, authenticated using (true);

create policy players_select_public on public.players
  for select to anon, authenticated using (true);

create policy player_external_ids_select_public on public.player_external_ids
  for select to anon, authenticated using (true);

create policy seasons_select_public on public.seasons
  for select to anon, authenticated using (true);

create policy games_select_public on public.games
  for select to anon, authenticated using (true);

create policy game_external_ids_select_public on public.game_external_ids
  for select to anon, authenticated using (true);

create policy player_game_stats_select_public on public.player_game_stats
  for select to anon, authenticated using (true);

grant usage on schema public to anon, authenticated, service_role;

grant select on
  public.sports,
  public.teams,
  public.team_external_ids,
  public.players,
  public.player_external_ids,
  public.seasons,
  public.games,
  public.game_external_ids,
  public.player_game_stats
to anon, authenticated;

grant select, update on public.users to authenticated;
grant all on all tables in schema public to service_role;
