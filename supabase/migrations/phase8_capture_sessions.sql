create extension if not exists pgcrypto;

create table if not exists public.capture_sessions (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'completed',
  started_at timestamptz,
  ended_at timestamptz,
  duration_ms bigint not null default 0,
  bundle_file_name text not null,
  zip_path text not null,
  snapshot_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.capture_session_summaries (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references public.capture_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists capture_sessions_user_created_at_idx
  on public.capture_sessions (user_id, created_at desc);

create index if not exists capture_session_summaries_user_created_at_idx
  on public.capture_session_summaries (user_id, created_at desc);

insert into storage.buckets (id, name, public)
values
  ('raw-bundles', 'raw-bundles', false),
  ('snapshots', 'snapshots', false)
on conflict (id) do nothing;

alter table public.capture_sessions enable row level security;
alter table public.capture_session_summaries enable row level security;

drop policy if exists "capture_sessions_select_own" on public.capture_sessions;
create policy "capture_sessions_select_own"
on public.capture_sessions
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "capture_sessions_insert_own" on public.capture_sessions;
create policy "capture_sessions_insert_own"
on public.capture_sessions
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "capture_sessions_update_own" on public.capture_sessions;
create policy "capture_sessions_update_own"
on public.capture_sessions
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "capture_sessions_delete_own" on public.capture_sessions;
create policy "capture_sessions_delete_own"
on public.capture_sessions
for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists "capture_session_summaries_select_own" on public.capture_session_summaries;
create policy "capture_session_summaries_select_own"
on public.capture_session_summaries
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "capture_session_summaries_insert_own" on public.capture_session_summaries;
create policy "capture_session_summaries_insert_own"
on public.capture_session_summaries
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "capture_session_summaries_delete_own" on public.capture_session_summaries;
create policy "capture_session_summaries_delete_own"
on public.capture_session_summaries
for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists "raw_bundles_select_own" on storage.objects;
create policy "raw_bundles_select_own"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'raw-bundles'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "raw_bundles_insert_own" on storage.objects;
create policy "raw_bundles_insert_own"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'raw-bundles'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "raw_bundles_delete_own" on storage.objects;
create policy "raw_bundles_delete_own"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'raw-bundles'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "snapshots_select_own" on storage.objects;
create policy "snapshots_select_own"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'snapshots'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "snapshots_insert_own" on storage.objects;
create policy "snapshots_insert_own"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'snapshots'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "snapshots_delete_own" on storage.objects;
create policy "snapshots_delete_own"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'snapshots'
  and auth.uid()::text = (storage.foldername(name))[1]
);
