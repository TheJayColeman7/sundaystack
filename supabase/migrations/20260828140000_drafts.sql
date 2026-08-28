-- Phase 0.3: snake draft. One redraft per league. Express enforces rules.

alter table public.leagues drop constraint if exists leagues_status_check;
alter table public.leagues add constraint leagues_status_check
  check (status in ('pre_draft', 'drafting', 'active'));

-- ---------------------------------------------------------------------------
-- drafts
-- ---------------------------------------------------------------------------

create table public.drafts (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null unique references public.leagues (id) on delete cascade,
  status text not null default 'lobby'
    check (status in ('lobby', 'live', 'complete')),
  seconds_per_pick integer not null default 90
    check (seconds_per_pick >= 30 and seconds_per_pick <= 300),
  current_pick_number integer not null default 1 check (current_pick_number >= 1),
  current_pick_started_at timestamptz,
  total_picks integer not null check (total_picks >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger drafts_set_updated_at
  before update on public.drafts
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- draft_order
-- ---------------------------------------------------------------------------

create table public.draft_order (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.drafts (id) on delete cascade,
  slot integer not null check (slot >= 1),
  fantasy_team_id uuid not null references public.fantasy_teams (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (draft_id, slot),
  unique (draft_id, fantasy_team_id)
);

create trigger draft_order_set_updated_at
  before update on public.draft_order
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- draft_picks
-- ---------------------------------------------------------------------------

create table public.draft_picks (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.drafts (id) on delete cascade,
  pick_number integer not null check (pick_number >= 1),
  fantasy_team_id uuid not null references public.fantasy_teams (id) on delete cascade,
  player_id uuid references public.players (id),
  source text not null check (source in ('manual', 'queue', 'autopick', 'passed_full')),
  picked_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (draft_id, pick_number)
);

create trigger draft_picks_set_updated_at
  before update on public.draft_picks
  for each row execute function public.set_updated_at();

create index draft_picks_player_id_idx on public.draft_picks (player_id);

-- ---------------------------------------------------------------------------
-- draft_queues
-- ---------------------------------------------------------------------------

create table public.draft_queues (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.drafts (id) on delete cascade,
  user_id uuid not null references public.users (id),
  player_id uuid not null references public.players (id),
  rank integer not null check (rank >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (draft_id, user_id, player_id),
  unique (draft_id, user_id, rank)
);

create trigger draft_queues_set_updated_at
  before update on public.draft_queues
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.drafts enable row level security;
alter table public.draft_order enable row level security;
alter table public.draft_picks enable row level security;
alter table public.draft_queues enable row level security;

create policy drafts_select_member on public.drafts
  for select to authenticated
  using (
    exists (
      select 1 from public.league_members m
      where m.league_id = drafts.league_id and m.user_id = auth.uid()
    )
  );

create policy draft_order_select_member on public.draft_order
  for select to authenticated
  using (
    exists (
      select 1 from public.drafts d
      join public.league_members m on m.league_id = d.league_id
      where d.id = draft_order.draft_id and m.user_id = auth.uid()
    )
  );

create policy draft_picks_select_member on public.draft_picks
  for select to authenticated
  using (
    exists (
      select 1 from public.drafts d
      join public.league_members m on m.league_id = d.league_id
      where d.id = draft_picks.draft_id and m.user_id = auth.uid()
    )
  );

create policy draft_queues_select_own on public.draft_queues
  for select to authenticated
  using (user_id = auth.uid());

grant select on
  public.drafts,
  public.draft_order,
  public.draft_picks,
  public.draft_queues
to authenticated;

grant all on all tables in schema public to service_role;
