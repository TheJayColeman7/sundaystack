-- Phase 0.5a: ESPN-style free agents and waivers.
-- Awards mutate live roster_players only; no fantasy points stored.

alter table public.league_settings
  add column if not exists waiver_type text not null default 'faab';

alter table public.league_settings
  drop constraint if exists league_settings_waiver_type_check;

alter table public.league_settings
  add constraint league_settings_waiver_type_check
  check (waiver_type in ('priority', 'faab'));

alter table public.league_settings
  add column if not exists faab_budget integer not null default 100;

alter table public.league_settings
  drop constraint if exists league_settings_faab_budget_check;

alter table public.league_settings
  add constraint league_settings_faab_budget_check
  check (faab_budget >= 0);

alter table public.league_settings
  add column if not exists waiver_process_weekday integer not null default 2;

alter table public.league_settings
  drop constraint if exists league_settings_waiver_process_weekday_check;

alter table public.league_settings
  add constraint league_settings_waiver_process_weekday_check
  check (waiver_process_weekday >= 0 and waiver_process_weekday <= 6);

alter table public.league_settings
  add column if not exists waiver_process_hour_utc integer not null default 7;

alter table public.league_settings
  drop constraint if exists league_settings_waiver_process_hour_utc_check;

alter table public.league_settings
  add constraint league_settings_waiver_process_hour_utc_check
  check (waiver_process_hour_utc >= 0 and waiver_process_hour_utc <= 23);

-- ---------------------------------------------------------------------------
-- waiver_priorities
-- ---------------------------------------------------------------------------

create table if not exists public.waiver_priorities (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  fantasy_team_id uuid not null references public.fantasy_teams (id) on delete cascade,
  rank integer not null check (rank >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (league_id, fantasy_team_id),
  unique (league_id, rank)
);

drop trigger if exists waiver_priorities_set_updated_at on public.waiver_priorities;
create trigger waiver_priorities_set_updated_at
  before update on public.waiver_priorities
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- faab_balances
-- ---------------------------------------------------------------------------

create table if not exists public.faab_balances (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  fantasy_team_id uuid not null references public.fantasy_teams (id) on delete cascade,
  remaining integer not null check (remaining >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (league_id, fantasy_team_id)
);

drop trigger if exists faab_balances_set_updated_at on public.faab_balances;
create trigger faab_balances_set_updated_at
  before update on public.faab_balances
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- waiver_periods
-- ---------------------------------------------------------------------------

create table if not exists public.waiver_periods (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  process_at timestamptz not null,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (league_id, process_at)
);

drop trigger if exists waiver_periods_set_updated_at on public.waiver_periods;
create trigger waiver_periods_set_updated_at
  before update on public.waiver_periods
  for each row execute function public.set_updated_at();

create index if not exists waiver_periods_league_id_process_at_idx on public.waiver_periods (league_id, process_at);

-- ---------------------------------------------------------------------------
-- waiver_claims
-- ---------------------------------------------------------------------------

create table if not exists public.waiver_claims (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  period_id uuid not null references public.waiver_periods (id) on delete cascade,
  fantasy_team_id uuid not null references public.fantasy_teams (id) on delete cascade,
  player_id uuid not null references public.players (id),
  drop_player_id uuid references public.players (id),
  bid integer not null default 0 check (bid >= 0),
  rank integer not null check (rank >= 1),
  status text not null default 'pending' check (status in ('pending', 'won', 'lost', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (period_id, fantasy_team_id, player_id)
);

drop trigger if exists waiver_claims_set_updated_at on public.waiver_claims;
create trigger waiver_claims_set_updated_at
  before update on public.waiver_claims
  for each row execute function public.set_updated_at();

create index if not exists waiver_claims_period_id_status_idx on public.waiver_claims (period_id, status);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.waiver_priorities enable row level security;
alter table public.faab_balances enable row level security;
alter table public.waiver_periods enable row level security;
alter table public.waiver_claims enable row level security;

drop policy if exists waiver_priorities_select_member on public.waiver_priorities;
create policy waiver_priorities_select_member on public.waiver_priorities
  for select to authenticated
  using (
    exists (
      select 1 from public.league_members m
      where m.league_id = waiver_priorities.league_id and m.user_id = auth.uid()
    )
  );

drop policy if exists faab_balances_select_member on public.faab_balances;
create policy faab_balances_select_member on public.faab_balances
  for select to authenticated
  using (
    exists (
      select 1 from public.league_members m
      where m.league_id = faab_balances.league_id and m.user_id = auth.uid()
    )
  );

drop policy if exists waiver_periods_select_member on public.waiver_periods;
create policy waiver_periods_select_member on public.waiver_periods
  for select to authenticated
  using (
    exists (
      select 1 from public.league_members m
      where m.league_id = waiver_periods.league_id and m.user_id = auth.uid()
    )
  );

drop policy if exists waiver_claims_select_member on public.waiver_claims;
create policy waiver_claims_select_member on public.waiver_claims
  for select to authenticated
  using (
    exists (
      select 1 from public.league_members m
      where m.league_id = waiver_claims.league_id and m.user_id = auth.uid()
    )
  );

grant select on
  public.waiver_priorities,
  public.faab_balances,
  public.waiver_periods,
  public.waiver_claims
to authenticated;

grant all on all tables in schema public to service_role;
