-- Phase 0.4: weekly H2H matchups and locked lineups.
-- Fantasy points are computed on read; not stored here.

alter table public.league_settings
  add column if not exists regular_season_weeks integer not null default 14;

alter table public.league_settings
  drop constraint if exists league_settings_regular_season_weeks_check;

alter table public.league_settings
  add constraint league_settings_regular_season_weeks_check
  check (regular_season_weeks >= 1 and regular_season_weeks <= 17);

-- Kicker rules for existing leagues (idempotent on unique league_id + stat_key).
insert into public.league_scoring_rules (league_id, stat_key, points_per)
select l.id, v.stat_key, v.points_per
from public.leagues l
cross join (
  values
    ('extra_points_made', 1),
    ('field_goals_made_0_19', 3),
    ('field_goals_made_20_29', 3),
    ('field_goals_made_30_39', 3),
    ('field_goals_made_40_49', 4),
    ('field_goals_made_50_plus', 5)
) as v(stat_key, points_per)
on conflict (league_id, stat_key) do nothing;

-- ---------------------------------------------------------------------------
-- matchups
-- ---------------------------------------------------------------------------

create table public.matchups (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  week integer not null check (week >= 1),
  home_fantasy_team_id uuid not null references public.fantasy_teams (id) on delete cascade,
  away_fantasy_team_id uuid not null references public.fantasy_teams (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (home_fantasy_team_id <> away_fantasy_team_id),
  unique (league_id, week, home_fantasy_team_id),
  unique (league_id, week, away_fantasy_team_id)
);

create trigger matchups_set_updated_at
  before update on public.matchups
  for each row execute function public.set_updated_at();

create index matchups_league_id_week_idx on public.matchups (league_id, week);

-- ---------------------------------------------------------------------------
-- weekly_lineups
-- ---------------------------------------------------------------------------

create table public.weekly_lineups (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  week integer not null check (week >= 1),
  fantasy_team_id uuid not null references public.fantasy_teams (id) on delete cascade,
  player_id uuid not null references public.players (id),
  slot text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (league_id, week, fantasy_team_id, player_id)
);

create trigger weekly_lineups_set_updated_at
  before update on public.weekly_lineups
  for each row execute function public.set_updated_at();

create index weekly_lineups_team_week_idx on public.weekly_lineups (fantasy_team_id, week);

-- ---------------------------------------------------------------------------
-- week_locks
-- ---------------------------------------------------------------------------

create table public.week_locks (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  week integer not null check (week >= 1),
  locked_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (league_id, week)
);

create trigger week_locks_set_updated_at
  before update on public.week_locks
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.matchups enable row level security;
alter table public.weekly_lineups enable row level security;
alter table public.week_locks enable row level security;

create policy matchups_select_member on public.matchups
  for select to authenticated
  using (
    exists (
      select 1 from public.league_members m
      where m.league_id = matchups.league_id and m.user_id = auth.uid()
    )
  );

create policy weekly_lineups_select_member on public.weekly_lineups
  for select to authenticated
  using (
    exists (
      select 1 from public.league_members m
      where m.league_id = weekly_lineups.league_id and m.user_id = auth.uid()
    )
  );

create policy week_locks_select_member on public.week_locks
  for select to authenticated
  using (
    exists (
      select 1 from public.league_members m
      where m.league_id = week_locks.league_id and m.user_id = auth.uid()
    )
  );

grant select on
  public.matchups,
  public.weekly_lineups,
  public.week_locks
to authenticated;

grant all on all tables in schema public to service_role;
