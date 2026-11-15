-- RL Survey Lab: follow-up authorization and snapshot privacy hardening.
-- Run once AFTER 20261114_advisor_collaboration.sql. No local data is touched.
begin;

-- Clients cannot supply generated IDs, timestamps, decisions or revocation metadata.
revoke insert on public.advisor_requests, public.advisor_notes, public.published_snapshots from authenticated;
grant insert (project_id,submitted_by,request_type,title,details) on public.advisor_requests to authenticated;
grant insert (project_id,authored_by,category,title,body) on public.advisor_notes to authenticated;
grant insert (project_id,published_by,payload) on public.published_snapshots to authenticated;

-- Enforce the exact nested shape of the browser's selective progress payload.
create or replace function public.valid_progress_payload(p jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare x jsonb; n numeric; c numeric; t numeric;
begin
  if jsonb_typeof(p) is distinct from 'object'
    or not (p ?& array['displayName','projectTitle'])
    or (p - array['displayName','projectTitle','stage','courses','papers','hoursWeek','nextGoal']) <> '{}'::jsonb
    or jsonb_typeof(p->'displayName') is distinct from 'string'
    or jsonb_typeof(p->'projectTitle') is distinct from 'string'
    or char_length(p->>'displayName') not between 1 and 120
    or char_length(p->>'projectTitle') not between 1 and 200 then return false; end if;

  if p ? 'stage' then
    x := p->'stage';
    if jsonb_typeof(x) is distinct from 'object'
      or not (x ?& array['number','title','percent'])
      or (x - array['number','title','percent']) <> '{}'::jsonb
      or jsonb_typeof(x->'number') is distinct from 'number'
      or jsonb_typeof(x->'title') is distinct from 'string'
      or jsonb_typeof(x->'percent') is distinct from 'number'
      or char_length(x->>'title') not between 1 and 200 then return false; end if;
    n := (x->>'number')::numeric;
    c := (x->>'percent')::numeric;
    if n <> trunc(n) or n not between 1 and 7
      or c <> trunc(c) or c not between 0 and 100 then return false; end if;
  end if;

  if p ? 'courses' then
    if jsonb_typeof(p->'courses') is distinct from 'array' then return false; end if;
    if jsonb_array_length(p->'courses') > 4 then return false; end if;
    for x in select value from jsonb_array_elements(p->'courses') loop
      if jsonb_typeof(x) is distinct from 'object'
        or not (x ?& array['name','completed','total'])
        or (x - array['name','completed','total']) <> '{}'::jsonb
        or jsonb_typeof(x->'name') is distinct from 'string'
        or jsonb_typeof(x->'completed') is distinct from 'number'
        or jsonb_typeof(x->'total') is distinct from 'number'
        or char_length(x->>'name') not between 1 and 200 then return false; end if;
      c := (x->>'completed')::numeric;
      t := (x->>'total')::numeric;
      if c <> trunc(c) or t <> trunc(t) or t not between 1 and 1000
        or c < 0 or c > t then return false; end if;
    end loop;
  end if;

  if p ? 'papers' then
    if jsonb_typeof(p->'papers') is distinct from 'array' then return false; end if;
    if jsonb_array_length(p->'papers') > 80 then return false; end if;
    for x in select value from jsonb_array_elements(p->'papers') loop
      if jsonb_typeof(x) is distinct from 'object'
        or not (x ?& array['title','year','url'])
        or (x - array['title','year','url']) <> '{}'::jsonb
        or jsonb_typeof(x->'title') is distinct from 'string'
        or jsonb_typeof(x->'year') not in ('number','null')
        or jsonb_typeof(x->'url') is distinct from 'string'
        or char_length(x->>'title') > 400
        or char_length(x->>'url') > 4096
        or ((x->>'url') <> '' and (x->>'url') !~ '^https?://') then return false; end if;
    end loop;
  end if;

  if p ? 'hoursWeek' then
    if jsonb_typeof(p->'hoursWeek') is distinct from 'number' then return false; end if;
    if (p->>'hoursWeek')::numeric < 0 then return false; end if;
  end if;
  if p ? 'nextGoal' then
    if jsonb_typeof(p->'nextGoal') is distinct from 'string'
      or char_length(p->>'nextGoal') > 600 then return false; end if;
  end if;
  return true;
end;
$$;
revoke all on function public.valid_progress_payload(jsonb) from public,anon;
grant execute on function public.valid_progress_payload(jsonb) to authenticated;

alter table public.published_snapshots
  add constraint published_snapshot_nested_shape
  check (public.valid_progress_payload(payload));

-- Keep only the latest active snapshot per project; retain older rows as revoked.
with ranked as (
  select id,row_number() over(partition by project_id order by created_at desc,id desc) as rn
  from public.published_snapshots where revoked_at is null
)
update public.published_snapshots s set revoked_at=now()
from ranked r where r.id=s.id and r.rn>1;
create unique index published_snapshots_one_active_per_project
  on public.published_snapshots(project_id) where revoked_at is null;

-- Atomic replacement. Lock the project to serialize publication and revocation.
create or replace function public.replace_previous_progress_snapshot()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or new.published_by <> (select auth.uid()) then
    raise exception 'Only the project owner may publish' using errcode='42501';
  end if;
  perform 1 from public.projects p
    where p.id=new.project_id and p.owner_user_id=(select auth.uid()) for update;
  if not found then
    raise exception 'Only the project owner may publish' using errcode='42501';
  end if;
  if new.revoked_at is not null then
    raise exception 'A new snapshot cannot already be revoked';
  end if;
  update public.published_snapshots s set revoked_at=now()
    where s.project_id=new.project_id and s.revoked_at is null;
  return new;
end;
$$;
create trigger replace_previous_progress_snapshot
before insert on public.published_snapshots for each row
execute function public.replace_previous_progress_snapshot();
revoke all on function public.replace_previous_progress_snapshot() from public,anon,authenticated;

create or replace function public.revoke_project_snapshots(p_project_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare changed_count integer;
begin
  perform 1 from public.projects p
    where p.id=p_project_id and p.owner_user_id=(select auth.uid()) for update;
  if not found then
    raise exception 'You cannot revoke this project' using errcode='42501';
  end if;
  update public.published_snapshots s set revoked_at=now()
  where s.project_id=p_project_id and s.revoked_at is null;
  get diagnostics changed_count = row_count;
  return changed_count;
end;
$$;
revoke all on function public.revoke_project_snapshots(uuid) from public,anon;
grant execute on function public.revoke_project_snapshots(uuid) to authenticated;

-- Abort the transaction if these smoke checks fail.
do $test$
begin
  if not public.valid_progress_payload(
    '{"displayName":"Example","projectTitle":"RL Survey Lab","stage":{"number":1,"title":"Understand core RL","percent":25},"courses":[{"name":"Example course","completed":1,"total":10}],"papers":[{"title":"Example paper","year":2025,"url":"https://example.org/paper"}],"hoursWeek":2.5,"nextGoal":"Read a paper"}'::jsonb
  ) then raise exception 'Valid payload rejected'; end if;
  if public.valid_progress_payload(
    '{"displayName":"Example","projectTitle":"RL Survey Lab","stage":{"number":1,"title":"Understand core RL","percent":25,"privateNotes":"test"}}'::jsonb
  ) then raise exception 'Unexpected nested field accepted'; end if;
  if has_column_privilege('authenticated','public.advisor_requests','status','INSERT')
    or has_column_privilege('authenticated','public.advisor_notes','created_at','INSERT')
    or has_column_privilege('authenticated','public.published_snapshots','revoked_at','INSERT')
    or not has_column_privilege('authenticated','public.published_snapshots','payload','INSERT')
  then raise exception 'Unexpected client column permissions'; end if;
end;
$test$;

commit;
select 'PASS: Advisor database hardening applied' as result;
