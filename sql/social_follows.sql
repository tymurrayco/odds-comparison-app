-- Following: profiles, follows, and followers reading each other's bets.
--
-- The rules (Tyler's answers, 2026-10-09):
--   * One-way follows, like X: I follow Mike and see his bets; he sees mine
--     only if he follows me.
--   * No approval by default. A person can switch their account to private,
--     and then new followers wait for their approval.
--   * People are found by name / handle, never by email.
--   * Followers see everything about a bet (stake included) as soon as it is
--     logged. Signed-out visitors see no profiles and no bets.
--
-- What this creates:
--   profiles         one row per account: handle, display name, picture, private flag
--   follows          who follows whom, and whether it is accepted or still pending
--   ensure_profile() makes the caller's profile the first time they show up
--   follow_user()    follow someone (accepted at once, or pending if they are private)
--   approve_follower() accept a pending follower
-- and it replaces the bets read rule: you read your own bets, plus the
-- (non-deleted) bets of people you follow with an accepted follow.
--
-- Run in the Supabase SQL editor. Safe to re-run.

-- ---------------------------------------------------------------- profiles
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  handle text not null unique check (handle ~ '^[a-z0-9_]{3,20}$'),
  display_name text not null check (char_length(display_name) between 1 and 40),
  avatar_url text,
  is_private boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles signed-in read" on public.profiles;
create policy "profiles signed-in read"
  on public.profiles for select
  to authenticated
  using (true);

drop policy if exists "profiles owner update" on public.profiles;
create policy "profiles owner update"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Rows are created only by ensure_profile() below (no insert policy).

-- ----------------------------------------------------------------- follows
create table if not exists public.follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  followee_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'accepted' check (status in ('accepted', 'pending')),
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);

create index if not exists follows_followee_idx on public.follows (followee_id);

alter table public.follows enable row level security;

-- You can see the follows you are part of (either side).
drop policy if exists "follows own read" on public.follows;
create policy "follows own read"
  on public.follows for select
  to authenticated
  using ((select auth.uid()) in (follower_id, followee_id));

-- Either side can end a follow: unfollow, remove a follower, or deny a request.
drop policy if exists "follows own delete" on public.follows;
create policy "follows own delete"
  on public.follows for delete
  to authenticated
  using ((select auth.uid()) in (follower_id, followee_id));

-- No insert / update policies: follow_user() and approve_follower() do those,
-- so a follower can never mark their own request as accepted.

-- --------------------------------------------------------------- functions
create or replace function public.ensure_profile()
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  p public.profiles;
  u record;
  base text;
  candidate text;
  n int := 0;
begin
  if uid is null then
    raise exception 'not signed in';
  end if;

  select * into p from public.profiles where id = uid;
  if found then
    return p;
  end if;

  select email, raw_user_meta_data as meta into u from auth.users where id = uid;

  -- handle: the Google name (else the email's local part), letters and digits only
  base := lower(regexp_replace(
    coalesce(nullif(u.meta->>'full_name', ''), nullif(u.meta->>'name', ''), split_part(u.email, '@', 1), 'user'),
    '[^a-zA-Z0-9]', '', 'g'));
  if char_length(base) < 3 then
    base := base || 'user';
  end if;
  base := left(base, 16);
  candidate := base;
  while exists (select 1 from public.profiles where handle = candidate) loop
    n := n + 1;
    candidate := base || n::text;
  end loop;

  insert into public.profiles (id, handle, display_name, avatar_url)
  values (
    uid,
    candidate,
    left(coalesce(nullif(u.meta->>'full_name', ''), nullif(u.meta->>'name', ''), candidate), 40),
    coalesce(u.meta->>'avatar_url', u.meta->>'picture')
  )
  on conflict (id) do nothing;

  select * into p from public.profiles where id = uid;
  return p;
end $$;

create or replace function public.follow_user(target uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  target_private boolean;
  result text;
begin
  if me is null then
    raise exception 'not signed in';
  end if;
  if target = me then
    raise exception 'you cannot follow yourself';
  end if;
  perform public.ensure_profile();

  select is_private into target_private from public.profiles where id = target;
  if not found then
    raise exception 'no such user';
  end if;

  insert into public.follows (follower_id, followee_id, status)
  values (me, target, case when target_private then 'pending' else 'accepted' end)
  on conflict (follower_id, followee_id) do nothing;

  select status into result from public.follows where follower_id = me and followee_id = target;
  return result;
end $$;

create or replace function public.approve_follower(follower uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.follows
  set status = 'accepted'
  where follower_id = follower and followee_id = auth.uid();
$$;

revoke all on function public.ensure_profile() from public, anon;
revoke all on function public.follow_user(uuid) from public, anon;
revoke all on function public.approve_follower(uuid) from public, anon;
grant execute on function public.ensure_profile() to authenticated;
grant execute on function public.follow_user(uuid) to authenticated;
grant execute on function public.approve_follower(uuid) to authenticated;

-- ------------------------------------------------------- bets: who can read
-- Replaces "bets owner read" (sql/bets_private.sql). Still no write policies:
-- every write goes through /api/bets with the service-role key.
alter table public.bets enable row level security;

drop policy if exists "bets public read" on public.bets;
drop policy if exists "bets owner read" on public.bets;
drop policy if exists "bets owner or follower read" on public.bets;
create policy "bets owner or follower read"
  on public.bets for select
  to authenticated
  using (
    (select auth.uid()) = user_id
    or (
      deleted = false
      and exists (
        select 1
        from public.follows f
        where f.follower_id = (select auth.uid())
          and f.followee_id = bets.user_id
          and f.status = 'accepted'
      )
    )
  );

-- Check: both tables exist and the new bets rule is the only read rule.
select
  (select count(*) from public.profiles) as profiles,
  (select count(*) from public.follows) as follows,
  (select string_agg(policyname, ', ') from pg_policies where schemaname = 'public' and tablename = 'bets') as bets_policies;

-- Undo (back to owner-only bets, no social tables):
--   drop policy if exists "bets owner or follower read" on public.bets;
--   create policy "bets owner read" on public.bets for select to authenticated using ((select auth.uid()) = user_id);
--   drop function if exists public.approve_follower(uuid), public.follow_user(uuid), public.ensure_profile();
--   drop table if exists public.follows, public.profiles;
