-- ── WP2: pinned_connections ────────────────────────────────────────────────────
-- Stores user-selected factor pairs to monitor between appointments.
-- Re-evaluated weekly via patternDetectionScheduler (device-side cadence).
-- RLS mirrors existing table policies: users can only see/modify their own rows.

create table if not exists pinned_connections (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references profiles(id) on delete cascade,
  factor_a           text not null,      -- domain column name or 'sleep'
  factor_b           text not null,      -- domain column name or 'sleep'
  lag                text not null default 'same_day',  -- 'same_day' | 'next_day'
  created_at         timestamptz not null default now(),
  last_evaluated_at  timestamptz,
  last_direction     text,              -- 'together' | 'inverse' | 'none' | null
  last_sufficient    boolean
);

-- RLS
alter table pinned_connections enable row level security;

create policy "Users can select their own pinned connections"
  on pinned_connections for select
  using ((select auth.uid()) = user_id);

create policy "Users can insert their own pinned connections"
  on pinned_connections for insert
  with check ((select auth.uid()) = user_id);

create policy "Users can update their own pinned connections"
  on pinned_connections for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their own pinned connections"
  on pinned_connections for delete
  using ((select auth.uid()) = user_id);
