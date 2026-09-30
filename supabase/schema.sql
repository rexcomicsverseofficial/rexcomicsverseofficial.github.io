-- Rex Comicsverse membership backend (Supabase). Safe to run again: every statement is idempotent.
-- Applied by .github/workflows/backend.yml through the Supabase Management API.
--
-- Rules:
--   * Anyone can see the list of published episodes (title, cover, number).
--   * Pages of episodes 1-3 of every series are free; later pages need an active paid membership.
--   * Only the creator can add, change, publish or delete episodes and upload files.
--   * Membership (tier / paid_until) is only ever set by the payment webhook, never by the reader.

-- ── Profiles ───────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id                       uuid primary key references auth.users(id) on delete cascade,
  email                    text,
  display_name             text,
  tier                     text not null default 'free' check (tier in ('free','fan','hero')),
  paid_until               timestamptz,
  is_creator               boolean not null default false,
  razorpay_subscription_id text,
  created_at               timestamptz not null default now()
);
alter table public.profiles enable row level security;

-- The creator's account (email reserved by the deploy workflow, so nobody else can register it).
create or replace function public.creator_email() returns text
language sql immutable as $$ select 'rexraja89@gmail.com'::text $$;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name, is_creator)
  values (new.id, new.email,
          coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
          lower(new.email) = public.creator_email())
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.is_creator() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_creator from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.has_paid_access() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select tier in ('fan','hero') and paid_until > now()
                   from public.profiles where id = auth.uid()), false)
$$;

drop policy if exists "read own profile" on public.profiles;
create policy "read own profile" on public.profiles for select
  using (id = auth.uid() or public.is_creator());
-- Readers may only change their display name (tier, paid_until, is_creator stay server-controlled).
revoke update on public.profiles from anon, authenticated;
grant update (display_name) on public.profiles to authenticated;
drop policy if exists "rename self" on public.profiles;
create policy "rename self" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

-- ── Episodes ───────────────────────────────────────────────────────────────
create table if not exists public.episodes (
  id           uuid primary key default gen_random_uuid(),
  series       text not null,
  number       int  not null check (number > 0),
  title        text not null,
  description  text not null default '',
  page_count   int  not null default 0,
  has_cover    boolean not null default false,
  published    boolean not null default false,
  published_at timestamptz,
  created_at   timestamptz not null default now(),
  unique (series, number)
);
-- First 3 episodes of every series are free.
alter table public.episodes add column if not exists is_free boolean generated always as (number <= 3) stored;
alter table public.episodes enable row level security;

drop policy if exists "read published episodes" on public.episodes;
create policy "read published episodes" on public.episodes for select
  using (published or public.is_creator());
drop policy if exists "creator writes episodes" on public.episodes;
create policy "creator writes episodes" on public.episodes for all
  using (public.is_creator()) with check (public.is_creator());

-- ── Files ──────────────────────────────────────────────────────────────────
-- covers: public (shown on cards to everyone).  pages: private, handed out as signed URLs.
insert into storage.buckets (id, name, public) values ('covers','covers', true)  on conflict (id) do update set public = true;
insert into storage.buckets (id, name, public) values ('pages', 'pages',  false) on conflict (id) do update set public = false;

-- Can the current reader open the pages of this episode?  Page files live at pages/<episode id>/<nnn>.jpg
create or replace function public.can_read_episode(ep uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_creator() or exists (
    select 1 from public.episodes e
    where e.id = ep and e.published and (e.is_free or public.has_paid_access()))
$$;
create or replace function public.folder_uuid(name text) returns uuid
language sql immutable as $$
  select case when split_part(name, '/', 1) ~ '^[0-9a-f-]{36}$' then split_part(name, '/', 1)::uuid end
$$;

drop policy if exists "read pages" on storage.objects;
create policy "read pages" on storage.objects for select
  using (bucket_id = 'pages' and public.can_read_episode(public.folder_uuid(name)));
drop policy if exists "read covers" on storage.objects;
create policy "read covers" on storage.objects for select using (bucket_id = 'covers');
drop policy if exists "creator uploads" on storage.objects;
create policy "creator uploads" on storage.objects for insert
  with check (bucket_id in ('pages','covers') and public.is_creator());
drop policy if exists "creator updates files" on storage.objects;
create policy "creator updates files" on storage.objects for update
  using (bucket_id in ('pages','covers') and public.is_creator());
drop policy if exists "creator deletes files" on storage.objects;
create policy "creator deletes files" on storage.objects for delete
  using (bucket_id in ('pages','covers') and public.is_creator());

-- ── Payments bookkeeping (server only) ─────────────────────────────────────
create table if not exists public.app_settings (key text primary key, value text not null);
alter table public.app_settings enable row level security;   -- no policies: only the service role reads it

-- ── Creator dashboard numbers ──────────────────────────────────────────────
create or replace function public.creator_stats() returns json
language sql stable security definer set search_path = public as $$
  select case when not public.is_creator() then null else json_build_object(
    'members',        (select count(*) from public.profiles),
    'paid_members',   (select count(*) from public.profiles where tier in ('fan','hero') and paid_until > now()),
    'fans',           (select count(*) from public.profiles where tier = 'fan'  and paid_until > now()),
    'heroes',         (select count(*) from public.profiles where tier = 'hero' and paid_until > now()),
    'episodes',       (select count(*) from public.episodes where published),
    'drafts',         (select count(*) from public.episodes where not published),
    'new_this_week',  (select count(*) from public.profiles where created_at > now() - interval '7 days')
  ) end
$$;
create or replace function public.creator_members() returns table (email text, display_name text, tier text, paid_until timestamptz, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select email, display_name, tier, paid_until, created_at from public.profiles
  where public.is_creator() order by created_at desc limit 500
$$;
grant execute on function public.creator_stats(), public.creator_members() to authenticated;

-- Keep the creator flag right even for accounts created before this schema existed.
update public.profiles set is_creator = (lower(email) = public.creator_email())
  where is_creator is distinct from (lower(email) = public.creator_email());
