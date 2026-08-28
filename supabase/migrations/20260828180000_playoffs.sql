-- Phase 0.5c: 4-team playoffs. Points stay computed on read.

alter table public.matchups
  add column if not exists kind text not null default 'regular';

alter table public.matchups
  drop constraint if exists matchups_kind_check;

alter table public.matchups
  add constraint matchups_kind_check
  check (kind in ('regular', 'playoff'));

create table if not exists public.playoff_seeds (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  seed integer not null check (seed >= 1 and seed <= 4),
  fantasy_team_id uuid not null references public.fantasy_teams (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (league_id, seed),
  unique (league_id, fantasy_team_id)
);

drop trigger if exists playoff_seeds_set_updated_at on public.playoff_seeds;
create trigger playoff_seeds_set_updated_at
  before update on public.playoff_seeds
  for each row execute function public.set_updated_at();

create index if not exists playoff_seeds_league_id_idx on public.playoff_seeds (league_id);

alter table public.playoff_seeds enable row level security;

drop policy if exists playoff_seeds_select_member on public.playoff_seeds;
create policy playoff_seeds_select_member on public.playoff_seeds
  for select to authenticated
  using (
    exists (
      select 1 from public.league_members m
      where m.league_id = playoff_seeds.league_id and m.user_id = auth.uid()
    )
  );

grant select on public.playoff_seeds to authenticated;
grant all on all tables in schema public to service_role;
