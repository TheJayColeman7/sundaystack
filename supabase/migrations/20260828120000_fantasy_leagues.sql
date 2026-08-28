-- Phase 0.2: fantasy leagues, settings, scoring rules, current rosters.
-- Express enforces league rules. RLS blocks anon; authenticated may select
-- leagues they belong to. The API uses the database owner (bypasses RLS).

create unique index if not exists auth_users_email_unique
  on auth.users (email)
  where email is not null;

-- ---------------------------------------------------------------------------
-- leagues
-- ---------------------------------------------------------------------------

create table public.leagues (
  id uuid primary key default gen_random_uuid(),
  sport_id uuid not null references public.sports (id),
  season_id uuid not null references public.seasons (id),
  name text not null,
  commissioner_user_id uuid not null references public.users (id),
  invite_code text not null unique,
  status text not null default 'pre_draft'
    check (status in ('pre_draft', 'active')),
  max_teams integer not null default 12
    check (max_teams >= 8 and max_teams <= 14),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger leagues_set_updated_at
  before update on public.leagues
  for each row execute function public.set_updated_at();

create index leagues_commissioner_user_id_idx on public.leagues (commissioner_user_id);
create index leagues_season_id_idx on public.leagues (season_id);

-- ---------------------------------------------------------------------------
-- league_members
-- ---------------------------------------------------------------------------

create table public.league_members (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  user_id uuid not null references public.users (id),
  role text not null check (role in ('commissioner', 'member')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (league_id, user_id)
);

create trigger league_members_set_updated_at
  before update on public.league_members
  for each row execute function public.set_updated_at();

create index league_members_user_id_idx on public.league_members (user_id);

-- ---------------------------------------------------------------------------
-- fantasy_teams
-- ---------------------------------------------------------------------------

create table public.fantasy_teams (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  owner_user_id uuid not null references public.users (id),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (league_id, owner_user_id)
);

create trigger fantasy_teams_set_updated_at
  before update on public.fantasy_teams
  for each row execute function public.set_updated_at();

create index fantasy_teams_league_id_idx on public.fantasy_teams (league_id);

-- ---------------------------------------------------------------------------
-- league_settings (1:1)
-- ---------------------------------------------------------------------------

create table public.league_settings (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null unique references public.leagues (id) on delete cascade,
  qb integer not null default 1 check (qb >= 0),
  rb integer not null default 2 check (rb >= 0),
  wr integer not null default 2 check (wr >= 0),
  te integer not null default 1 check (te >= 0),
  flex integer not null default 1 check (flex >= 0),
  superflex integer not null default 0 check (superflex >= 0),
  k integer not null default 1 check (k >= 0),
  def integer not null default 1 check (def >= 0),
  bench integer not null default 6 check (bench >= 0),
  ir integer not null default 0 check (ir >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger league_settings_set_updated_at
  before update on public.league_settings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- league_scoring_rules — stored settings, not computed fantasy points
-- ---------------------------------------------------------------------------

create table public.league_scoring_rules (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  stat_key text not null,
  points_per numeric(8, 4) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (league_id, stat_key)
);

create trigger league_scoring_rules_set_updated_at
  before update on public.league_scoring_rules
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- roster_players — current roster + lineup slot (not weekly lineups)
-- ---------------------------------------------------------------------------

create table public.roster_players (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  fantasy_team_id uuid not null references public.fantasy_teams (id) on delete cascade,
  player_id uuid not null references public.players (id),
  slot text not null check (
    slot in ('QB', 'RB', 'WR', 'TE', 'FLEX', 'SUPERFLEX', 'K', 'DEF', 'BENCH')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (fantasy_team_id, player_id),
  unique (league_id, player_id)
);

create trigger roster_players_set_updated_at
  before update on public.roster_players
  for each row execute function public.set_updated_at();

create index roster_players_fantasy_team_id_idx on public.roster_players (fantasy_team_id);

-- ---------------------------------------------------------------------------
-- RLS: anon cannot read fantasy tables. authenticated can select memberships.
-- ---------------------------------------------------------------------------

alter table public.leagues enable row level security;
alter table public.league_members enable row level security;
alter table public.fantasy_teams enable row level security;
alter table public.league_settings enable row level security;
alter table public.league_scoring_rules enable row level security;
alter table public.roster_players enable row level security;

create policy leagues_select_member on public.leagues
  for select to authenticated
  using (
    exists (
      select 1 from public.league_members m
      where m.league_id = leagues.id and m.user_id = auth.uid()
    )
  );

create policy league_members_select_member on public.league_members
  for select to authenticated
  using (
    exists (
      select 1 from public.league_members m
      where m.league_id = league_members.league_id and m.user_id = auth.uid()
    )
  );

create policy fantasy_teams_select_member on public.fantasy_teams
  for select to authenticated
  using (
    exists (
      select 1 from public.league_members m
      where m.league_id = fantasy_teams.league_id and m.user_id = auth.uid()
    )
  );

create policy league_settings_select_member on public.league_settings
  for select to authenticated
  using (
    exists (
      select 1 from public.league_members m
      where m.league_id = league_settings.league_id and m.user_id = auth.uid()
    )
  );

create policy league_scoring_rules_select_member on public.league_scoring_rules
  for select to authenticated
  using (
    exists (
      select 1 from public.league_members m
      where m.league_id = league_scoring_rules.league_id and m.user_id = auth.uid()
    )
  );

create policy roster_players_select_member on public.roster_players
  for select to authenticated
  using (
    exists (
      select 1 from public.league_members m
      where m.league_id = roster_players.league_id and m.user_id = auth.uid()
    )
  );

grant select on
  public.leagues,
  public.league_members,
  public.fantasy_teams,
  public.league_settings,
  public.league_scoring_rules,
  public.roster_players
to authenticated;

grant all on all tables in schema public to service_role;
