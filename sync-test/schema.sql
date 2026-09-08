-- Isolated from production cet6_user_state. All times are client edit milliseconds.
create table public.cet6_sync_test_records (
 user_id uuid not null references auth.users(id) on delete cascade,
 key text not null check (length(key)<512),
 value jsonb not null default 'null',
 updated_at bigint not null check(updated_at>=0),
 mutation_id text not null,
 deleted boolean not null default false,
 received_at timestamptz not null default now(),
 primary key(user_id,key)
);
alter table public.cet6_sync_test_records enable row level security;
revoke all on public.cet6_sync_test_records from anon,authenticated;
grant select,insert,update on public.cet6_sync_test_records to authenticated;
create policy own_select on public.cet6_sync_test_records for select to authenticated using ((select auth.uid())=user_id);
create policy own_insert on public.cet6_sync_test_records for insert to authenticated with check ((select auth.uid())=user_id);
create policy own_update on public.cet6_sync_test_records for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create function public.cet6_sync_test_v3(changes jsonb default '[]',seed jsonb default '[]') returns jsonb
language plpgsql security invoker set search_path='' as $$
declare e jsonb; result jsonb; uid uuid:=auth.uid();
begin
 if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if jsonb_typeof(changes)<>'array' or jsonb_typeof(seed)<>'array' or jsonb_array_length(changes)>300 or jsonb_array_length(seed)>20000 then raise exception 'Invalid batch';end if;
 -- A stable order avoids deadlocks when devices update the same group concurrently.
 for e in select value from jsonb_array_elements(seed) order by value->>'key' loop
 insert into public.cet6_sync_test_records(user_id,key,value,updated_at,mutation_id,deleted)
 values(uid,e->>'key',coalesce(e->'value','null'),coalesce((e->>'updatedAt')::bigint,0),'legacy',coalesce((e->>'deleted')::boolean,false)) on conflict do nothing;
 end loop;
 for e in select value from jsonb_array_elements(changes) order by value->>'key', (value->>'updatedAt')::bigint, value->>'mutationId' loop
 insert into public.cet6_sync_test_records as r(user_id,key,value,updated_at,mutation_id,deleted)
 values(uid,e->>'key',coalesce(e->'value','null'),(e->>'updatedAt')::bigint,e->>'mutationId',coalesce((e->>'deleted')::boolean,false))
 on conflict(user_id,key) do update set value=excluded.value,updated_at=excluded.updated_at,mutation_id=excluded.mutation_id,deleted=excluded.deleted,received_at=now()
 where (excluded.updated_at,excluded.mutation_id collate "C")>(r.updated_at,r.mutation_id collate "C");
 end loop;
 select coalesce(jsonb_agg(jsonb_build_object('key',key,'value',value,'updatedAt',updated_at,'mutationId',mutation_id,'deleted',deleted)),'[]') into result from public.cet6_sync_test_records where user_id=uid;
 return jsonb_build_object('records',result,'serverTime',floor(extract(epoch from clock_timestamp())*1000));
end;$$;
revoke all on function public.cet6_sync_test_v3(jsonb,jsonb) from public,anon;
grant execute on function public.cet6_sync_test_v3(jsonb,jsonb) to authenticated;
