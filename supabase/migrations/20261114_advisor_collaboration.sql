-- RL Survey Lab — PI collaboration MVP (NOT applied until a Supabase project is configured)
-- Apply only to a dedicated, trusted Supabase project, using a privileged migration account.
-- User membership is provisioned by trusted admin SQL after Auth invitations.
-- ALL data remains inaccessible until tables, grants, RLS and test identities are configured.

create extension if not exists pgcrypto;

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id),
  title text not null check (char_length(title) between 1 and 200),
  description text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.project_members (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  role text not null check (role in ('owner','advisor')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (project_id,user_id)
);

create table if not exists public.advisor_requests (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  submitted_by uuid not null references auth.users(id),
  request_type text not null check (request_type in ('topic','paper','milestone','meeting','other')),
  title text not null check (char_length(title) between 5 and 180),
  details text not null check (char_length(details) between 5 and 4000),
  status text not null default 'pending' check (status in ('pending','approved','denied','changes_requested')),
  advisor_feedback text,
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  check (advisor_feedback is null or char_length(advisor_feedback) <= 4000)
);

create table if not exists public.advisor_notes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  authored_by uuid not null references auth.users(id),
  category text not null check (category in ('note','recommendation','reading','meeting')),
  title text not null check (char_length(title) between 3 and 180),
  body text not null check (char_length(body) between 3 and 4000),
  created_at timestamptz not null default now()
);

create table if not exists public.published_snapshots (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  published_by uuid not null references auth.users(id),
  payload jsonb not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check (jsonb_typeof(payload)='object'),
  check (pg_column_size(payload)<=60000),
  check ((payload - array['displayName','projectTitle','stage','courses','papers','hoursWeek','nextGoal'])='{}'::jsonb)
);

create index if not exists projects_owner_idx on public.projects(owner_user_id);
create index if not exists project_members_user_idx on public.project_members(user_id);
create index if not exists advisor_requests_project_created_idx on public.advisor_requests(project_id,created_at desc);
create index if not exists advisor_notes_project_created_idx on public.advisor_notes(project_id,created_at desc);
create index if not exists published_snapshots_project_created_idx on public.published_snapshots(project_id,created_at desc);

alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.advisor_requests enable row level security;
alter table public.advisor_notes enable row level security;
alter table public.published_snapshots enable row level security;

revoke all on public.projects, public.project_members, public.advisor_requests, public.advisor_notes, public.published_snapshots from anon, authenticated;
grant select on public.projects, public.project_members to authenticated;
grant select, insert on public.advisor_requests, public.advisor_notes, public.published_snapshots to authenticated;

-- Membership is admin-provisioned, never client-controlled.
create policy "member reads own membership" on public.project_members
for select to authenticated using (user_id=(select auth.uid()) and active=true);

create policy "owner or advisor reads assigned project" on public.projects
for select to authenticated using (
  owner_user_id=(select auth.uid())
  or exists(select 1 from public.project_members m where m.project_id=id and m.user_id=(select auth.uid()) and m.role='advisor' and m.active)
);

create policy "owner and advisor read requests" on public.advisor_requests
for select to authenticated using (
  exists(select 1 from public.projects p where p.id=project_id and
   (p.owner_user_id=(select auth.uid()) or exists(
     select 1 from public.project_members m where m.project_id=p.id and m.user_id=(select auth.uid()) and m.role='advisor' and m.active
   )))
);

create policy "owner submits pending requests only" on public.advisor_requests
for insert to authenticated with check (
  submitted_by=(select auth.uid()) and status='pending'
  and advisor_feedback is null and decided_by is null and decided_at is null
  and exists(select 1 from public.projects p where p.id=project_id and p.owner_user_id=(select auth.uid()))
);

create policy "owner and advisor read advisor notes" on public.advisor_notes
for select to authenticated using (
  exists(select 1 from public.projects p where p.id=project_id and
   (p.owner_user_id=(select auth.uid()) or exists(
     select 1 from public.project_members m where m.project_id=p.id and m.user_id=(select auth.uid()) and m.role='advisor' and m.active
   )))
);

create policy "advisor inserts recommendations" on public.advisor_notes
for insert to authenticated with check (
  authored_by=(select auth.uid())
  and exists(select 1 from public.project_members m where m.project_id=advisor_notes.project_id
       and m.user_id=(select auth.uid()) and m.role='advisor' and m.active)
);

create policy "owner and advisor read published progress" on public.published_snapshots
for select to authenticated using (
  revoked_at is null and exists(select 1 from public.projects p where p.id=project_id and
    (p.owner_user_id=(select auth.uid()) or exists(
      select 1 from public.project_members m where m.project_id=p.id and m.user_id=(select auth.uid()) and m.role='advisor' and m.active
    )))
);

create policy "owner publishes approved progress payload" on public.published_snapshots
for insert to authenticated with check (
  published_by=(select auth.uid())
  and exists(select 1 from public.projects p where p.id=project_id and p.owner_user_id=(select auth.uid()))
);

-- Request decisions require an authenticated, currently active advisor.
-- Not granting table UPDATE prevents clients bypassing the transition check.
create or replace function public.respond_to_advisor_request(
 p_request_id uuid, p_decision text, p_feedback text
) returns public.advisor_requests
language plpgsql
security definer
set search_path = ''
as $$
declare r public.advisor_requests;
begin
 if (select auth.uid()) is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if p_decision not in ('approved','denied','changes_requested') then
  raise exception 'Invalid decision';
 end if;
 if p_feedback is null or char_length(btrim(p_feedback)) < 3 or char_length(p_feedback)>4000 then
  raise exception 'Please include a decision note between 3 and 4000 characters';
 end if;
 update public.advisor_requests ar
 set status=p_decision, advisor_feedback=btrim(p_feedback), decided_by=(select auth.uid()), decided_at=now()
 where ar.id=p_request_id
 and ar.status='pending'
 and exists(select 1 from public.project_members m where m.project_id=ar.project_id
            and m.user_id=(select auth.uid()) and m.role='advisor' and m.active)
 returning * into r;
 if not found then
  raise exception 'Request not found, already decided, or access denied' using errcode='42501';
 end if;
 return r;
end;
$$;

revoke all on function public.respond_to_advisor_request(uuid,text,text) from public,anon;
grant execute on function public.respond_to_advisor_request(uuid,text,text) to authenticated;

-- The researcher can revoke future database reads of ALL their published snapshots.
-- Revocation cannot take back screenshots, copies or an already loaded tab.
create or replace function public.revoke_project_snapshots(p_project_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $
declare changed_count integer;
begin
 if (select auth.uid()) is null then
  raise exception 'Authentication required' using errcode='42501';
 end if;
 if not exists(select 1 from public.projects p where p.id=p_project_id
               and p.owner_user_id=(select auth.uid())) then
  raise exception 'You cannot revoke this project' using errcode='42501';
 end if;
 update public.published_snapshots s
 set revoked_at=now()
 where s.project_id=p_project_id and s.revoked_at is null;
 get diagnostics changed_count = row_count;
 return changed_count;
end;
$;
revoke all on function public.revoke_project_snapshots(uuid) from public,anon;
grant execute on function public.revoke_project_snapshots(uuid) to authenticated;

-- The admin must invite identities and provision the project and roles manually:
-- INSERT INTO public.projects(owner_user_id,title) VALUES ('<owner-auth-user-id>','RL Literature Survey') RETURNING id;
-- INSERT INTO public.project_members(project_id,user_id,role,active)
-- VALUES ('<project-id>','<advisor-auth-user-id>','advisor',true);
--
-- Do not create arbitrary membership by email submitted from the public browser.
-- IMPORTANT: Run grant/RLS tests with owner, advisor, unrelated signed-in user and anon
-- BEFORE deploying the authenticated pages.
