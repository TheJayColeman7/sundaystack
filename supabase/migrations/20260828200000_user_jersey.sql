-- Favorite NFL team + Home/Away jersey appearance.
-- Colors live on our teams rows (filled by ingest). Light/Dark stays later.

alter table public.teams
  add column if not exists primary_color text;

alter table public.teams
  add column if not exists secondary_color text;

alter table public.teams
  add column if not exists tertiary_color text;

alter table public.users
  add column if not exists favorite_team_id uuid references public.teams (id) on delete set null;

alter table public.users
  add column if not exists jersey_side text not null default 'home';

alter table public.users
  drop constraint if exists users_jersey_side_check;

alter table public.users
  add constraint users_jersey_side_check
  check (jersey_side in ('home', 'away'));

create index if not exists users_favorite_team_id_idx on public.users (favorite_team_id);
