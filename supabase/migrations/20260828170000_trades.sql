-- Phase 0.5b: two-team player trades.
-- Accept swaps live roster_players only; no fantasy points stored.

create table if not exists public.trades (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  proposer_fantasy_team_id uuid not null references public.fantasy_teams (id) on delete cascade,
  counterparty_fantasy_team_id uuid not null references public.fantasy_teams (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'completed', 'rejected', 'cancelled', 'expired')),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (proposer_fantasy_team_id <> counterparty_fantasy_team_id)
);

drop trigger if exists trades_set_updated_at on public.trades;
create trigger trades_set_updated_at
  before update on public.trades
  for each row execute function public.set_updated_at();

create index if not exists trades_league_id_status_idx on public.trades (league_id, status);

create table if not exists public.trade_players (
  id uuid primary key default gen_random_uuid(),
  trade_id uuid not null references public.trades (id) on delete cascade,
  from_fantasy_team_id uuid not null references public.fantasy_teams (id) on delete cascade,
  player_id uuid not null references public.players (id),
  role text not null check (role in ('send', 'drop')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (trade_id, player_id)
);

drop trigger if exists trade_players_set_updated_at on public.trade_players;
create trigger trade_players_set_updated_at
  before update on public.trade_players
  for each row execute function public.set_updated_at();

create index if not exists trade_players_trade_id_idx on public.trade_players (trade_id);

alter table public.trades enable row level security;
alter table public.trade_players enable row level security;

drop policy if exists trades_select_member on public.trades;
create policy trades_select_member on public.trades
  for select to authenticated
  using (
    exists (
      select 1 from public.league_members m
      where m.league_id = trades.league_id and m.user_id = auth.uid()
    )
  );

drop policy if exists trade_players_select_member on public.trade_players;
create policy trade_players_select_member on public.trade_players
  for select to authenticated
  using (
    exists (
      select 1 from public.trades t
      join public.league_members m on m.league_id = t.league_id
      where t.id = trade_players.trade_id and m.user_id = auth.uid()
    )
  );

grant select on public.trades, public.trade_players to authenticated;
grant all on all tables in schema public to service_role;
