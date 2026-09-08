create table if not exists public.cet6_user_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  client_updated_at bigint not null default 0,
  device_id text,
  updated_at timestamptz not null default now()
);

alter table public.cet6_user_state enable row level security;
alter table public.cet6_user_state force row level security;

create policy "cet6_select_own" on public.cet6_user_state
for select to authenticated using ((select auth.uid()) = user_id);
create policy "cet6_insert_own" on public.cet6_user_state
for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "cet6_update_own" on public.cet6_user_state
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy "cet6_delete_own" on public.cet6_user_state
for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on table public.cet6_user_state from anon;
grant select, insert, update, delete on table public.cet6_user_state to authenticated;

alter publication supabase_realtime add table public.cet6_user_state;
