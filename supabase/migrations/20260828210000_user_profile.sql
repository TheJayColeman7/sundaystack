-- Account profile: name split + optional avatar (data URL or https).

alter table public.users
  add column if not exists first_name text;

alter table public.users
  add column if not exists last_name text;

alter table public.users
  add column if not exists avatar_url text;
