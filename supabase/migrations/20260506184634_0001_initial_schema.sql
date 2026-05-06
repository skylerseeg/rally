-- Migration: 0001_initial_schema
-- Created:   2026-05-06T18:46:34Z (UTC)
--
-- Foundational schema for Rally. Implements the data model in
-- docs/ARCHITECTURE.md as resolved by the Decisions Log:
--
--   * Roles: leader | presidency | admin (calling_title is freeform)
--   * Quorum/class: deacons | teachers | priests | yw_12_13 | yw_14_15
--                   | yw_16_17 | sunday_school   (no per-class numbering)
--   * No member photos in v1 (no photo_object_id, no Storage bucket)
--   * unit_memberships.user_id references auth.users(id) directly;
--     there is intentionally no separate `profiles` table and no
--     on_auth_user_created trigger — leaders are seeded into a unit
--     by an existing presidency, not auto-provisioned on signup.
--
-- Multi-tenancy:
--   * Every domain table carries unit_id (except `units` itself).
--   * Every domain table has RLS enabled.
--   * Policies use app.accessible_units(), a SECURITY DEFINER function
--     that returns the set of unit ids the calling user belongs to.
--
-- Updated-at convention:
--   * Mutable tables (units, unit_memberships, members, activities,
--     attendance, lessons, agent_suggestions) carry updated_at +
--     a BEFORE UPDATE trigger calling public.set_updated_at().
--   * Append-only logs (usage_events, audit_events) intentionally do
--     NOT carry updated_at; they are immutable from application code
--     and have no UPDATE/DELETE policies.
--
-- Notes-field decision:
--   * members.notes is jsonb (e.g. {"general": "freeform text"}). This
--     diverges slightly from the prose in ARCHITECTURE.md ("free text")
--     and follows the explicit instruction to use jsonb for future
--     opt-in fields. The redactor must continue to drop notes by
--     default and only forward keys whose schema opts in.
--
-- Absence-reason decision:
--   * Modelled as enum public.absence_reason_kind on attendance, with
--     a separate nullable absence_reason_note text column for any
--     free-form detail. Enum keeps the bounded vocabulary tidy for
--     analytics; the text column captures one-off context.

begin;

-- ========================================================================
-- Schemas
-- ========================================================================

create schema if not exists app;
comment on schema app is 'Rally application helpers (RLS predicates, etc.). Not for table storage.';

-- ========================================================================
-- Enums
-- ========================================================================

create type public.unit_membership_role as enum ('leader', 'presidency', 'admin');

create type public.quorum_class as enum (
  'deacons',
  'teachers',
  'priests',
  'yw_12_13',
  'yw_14_15',
  'yw_16_17',
  'sunday_school'
);

create type public.activity_category as enum (
  'spiritual',
  'service',
  'social',
  'physical',
  'skill'
);

create type public.activity_status as enum (
  'draft',
  'confirmed',
  'completed',
  'cancelled'
);

create type public.attendance_status as enum (
  'present',
  'excused',
  'absent',
  'unknown'
);

create type public.absence_reason_kind as enum (
  'sports',
  'family_event',
  'travel',
  'sick',
  'work',
  'school_event',
  'no_response',
  'unknown',
  'other'
);

-- ========================================================================
-- Trigger helpers
-- ========================================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'BEFORE UPDATE trigger: stamps updated_at = now() on the row.';

-- ========================================================================
-- Tables
-- ========================================================================

-- ----- units -------------------------------------------------------------

create table public.units (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  stake_name    text,
  unit_number   text unique,
  timezone      text not null default 'America/Denver',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger units_set_updated_at
  before update on public.units
  for each row execute function public.set_updated_at();

-- ----- unit_memberships --------------------------------------------------

create table public.unit_memberships (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  unit_id         uuid not null references public.units(id) on delete cascade,
  role            public.unit_membership_role not null default 'leader',
  calling_title   text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (user_id, unit_id)
);

create index unit_memberships_user_id_idx on public.unit_memberships(user_id);
create index unit_memberships_unit_id_idx on public.unit_memberships(unit_id);

create trigger unit_memberships_set_updated_at
  before update on public.unit_memberships
  for each row execute function public.set_updated_at();

-- ----- members -----------------------------------------------------------

create table public.members (
  id              uuid primary key default gen_random_uuid(),
  unit_id         uuid not null references public.units(id) on delete cascade,
  quorum_class    public.quorum_class not null,
  first_name      text not null,
  last_name       text not null,
  preferred_name  text,
  birthdate       date not null,
  parent_contacts jsonb not null default '[]'::jsonb,
  notes           jsonb not null default '{}'::jsonb,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index members_unit_id_idx on public.members(unit_id);
create index members_unit_quorum_active_idx on public.members(unit_id, quorum_class) where is_active;

create trigger members_set_updated_at
  before update on public.members
  for each row execute function public.set_updated_at();

-- ----- activities --------------------------------------------------------

create table public.activities (
  id                    uuid primary key default gen_random_uuid(),
  unit_id               uuid not null references public.units(id) on delete cascade,
  quorum_class          public.quorum_class not null,
  title                 text not null,
  description           text,
  starts_at             timestamptz not null,
  ends_at               timestamptz,
  location              text,
  category              public.activity_category not null,
  planned_by            uuid references auth.users(id) on delete set null,
  status                public.activity_status not null default 'draft',
  ai_suggested          boolean not null default false,
  source_suggestion_id  uuid,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint activities_ends_after_start
    check (ends_at is null or ends_at >= starts_at)
);

create index activities_unit_id_idx on public.activities(unit_id);
create index activities_unit_starts_idx on public.activities(unit_id, starts_at desc);

create trigger activities_set_updated_at
  before update on public.activities
  for each row execute function public.set_updated_at();

-- ----- attendance --------------------------------------------------------

create table public.attendance (
  id                    uuid primary key default gen_random_uuid(),
  unit_id               uuid not null references public.units(id) on delete cascade,
  activity_id           uuid not null references public.activities(id) on delete cascade,
  member_id             uuid not null references public.members(id) on delete cascade,
  status                public.attendance_status not null default 'unknown',
  absence_reason_kind   public.absence_reason_kind,
  absence_reason_note   text,
  recorded_by           uuid references auth.users(id) on delete set null,
  recorded_at           timestamptz not null default now(),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (activity_id, member_id),
  constraint attendance_reason_only_when_absent
    check (
      absence_reason_kind is null
      or status in ('absent', 'excused', 'unknown')
    )
);

create index attendance_unit_id_idx on public.attendance(unit_id);
create index attendance_activity_id_idx on public.attendance(activity_id);
create index attendance_member_id_idx on public.attendance(member_id);

create trigger attendance_set_updated_at
  before update on public.attendance
  for each row execute function public.set_updated_at();

-- ----- lessons -----------------------------------------------------------

create table public.lessons (
  id                uuid primary key default gen_random_uuid(),
  unit_id           uuid not null references public.units(id) on delete cascade,
  quorum_class      public.quorum_class not null,
  taught_on         date not null,
  manual            text not null,
  manual_reference  text not null,
  teacher_user_id   uuid references auth.users(id) on delete set null,
  outline           jsonb,
  notes             jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on column public.lessons.manual is
  'Curriculum identifier. v1 seeds only come_follow_me_<year>; expand when AP/YW supplements ship.';

create index lessons_unit_id_idx on public.lessons(unit_id);
create index lessons_unit_taught_on_idx on public.lessons(unit_id, taught_on desc);

create trigger lessons_set_updated_at
  before update on public.lessons
  for each row execute function public.set_updated_at();

-- ----- usage_events (append-only) ---------------------------------------

create table public.usage_events (
  id                      uuid primary key default gen_random_uuid(),
  unit_id                 uuid not null references public.units(id) on delete cascade,
  agent_name              text not null,
  model                   text not null,
  input_tokens            integer not null default 0,
  output_tokens           integer not null default 0,
  cache_read_tokens       integer not null default 0,
  cache_creation_tokens   integer not null default 0,
  latency_ms              integer not null default 0,
  request_hash            text not null,
  user_hash               text not null,
  redaction_summary       jsonb not null default '{}'::jsonb,
  error_code              text,
  created_at              timestamptz not null default now()
);

comment on column public.usage_events.user_hash is
  'SHA-256 hex of (user_id || unit_id || day_bucket || RALLY_USAGE_HASH_SALT). Never the raw id.';
comment on column public.usage_events.request_hash is
  'SHA-256 hex of the prompt body. Body itself is never stored.';

create index usage_events_unit_id_idx on public.usage_events(unit_id);
create index usage_events_unit_created_idx on public.usage_events(unit_id, created_at desc);
create index usage_events_agent_idx on public.usage_events(agent_name, created_at desc);

-- ----- audit_events (append-only) ---------------------------------------

create table public.audit_events (
  id              uuid primary key default gen_random_uuid(),
  unit_id         uuid not null references public.units(id) on delete cascade,
  actor_user_id   uuid references auth.users(id) on delete set null,
  action          text not null,
  target_table    text not null,
  target_id       uuid,
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

create index audit_events_unit_id_idx on public.audit_events(unit_id);
create index audit_events_unit_created_idx on public.audit_events(unit_id, created_at desc);

-- ----- agent_suggestions ------------------------------------------------

create table public.agent_suggestions (
  id            uuid primary key default gen_random_uuid(),
  unit_id       uuid not null references public.units(id) on delete cascade,
  agent_name    text not null,
  input_hash    text not null,
  output        jsonb not null,
  accepted_by   uuid references auth.users(id) on delete set null,
  accepted_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index agent_suggestions_unit_id_idx on public.agent_suggestions(unit_id);
create index agent_suggestions_unit_agent_idx on public.agent_suggestions(unit_id, agent_name, created_at desc);

create trigger agent_suggestions_set_updated_at
  before update on public.agent_suggestions
  for each row execute function public.set_updated_at();

-- Now that activities and agent_suggestions both exist, link them.
alter table public.activities
  add constraint activities_source_suggestion_fk
  foreign key (source_suggestion_id)
  references public.agent_suggestions(id)
  on delete set null;

-- ========================================================================
-- app.accessible_units()
-- ========================================================================
--
-- SECURITY DEFINER so it can read unit_memberships from inside an RLS
-- policy without recursing on unit_memberships' own RLS, and so the
-- caller cannot subvert it by altering search_path.

create or replace function app.accessible_units()
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select unit_id
    from public.unit_memberships
   where user_id = auth.uid()
$$;

comment on function app.accessible_units() is
  'Returns the set of unit ids the calling user is a member of. Use as the canonical predicate in RLS policies.';

revoke all on function app.accessible_units() from public;
grant execute on function app.accessible_units() to authenticated, service_role;

-- Helper for the presidency-or-admin check used by destructive policies.
create or replace function app.has_unit_role(target_unit_id uuid, required_roles public.unit_membership_role[])
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from public.unit_memberships
     where user_id = auth.uid()
       and unit_id = target_unit_id
       and role = any(required_roles)
  )
$$;

comment on function app.has_unit_role(uuid, public.unit_membership_role[]) is
  'True if the calling user has any of the given roles in target_unit_id.';

revoke all on function app.has_unit_role(uuid, public.unit_membership_role[]) from public;
grant execute on function app.has_unit_role(uuid, public.unit_membership_role[]) to authenticated, service_role;

-- ========================================================================
-- Row Level Security
-- ========================================================================

alter table public.units              enable row level security;
alter table public.unit_memberships   enable row level security;
alter table public.members            enable row level security;
alter table public.activities         enable row level security;
alter table public.attendance         enable row level security;
alter table public.lessons            enable row level security;
alter table public.usage_events       enable row level security;
alter table public.audit_events       enable row level security;
alter table public.agent_suggestions  enable row level security;

-- ----- units -------------------------------------------------------------
-- Visible to any member of the unit. Mutations restricted to presidency.

create policy units_select_by_member
  on public.units for select
  using (id in (select app.accessible_units()));

create policy units_update_by_presidency
  on public.units for update
  using (app.has_unit_role(id, array['presidency','admin']::public.unit_membership_role[]))
  with check (app.has_unit_role(id, array['presidency','admin']::public.unit_membership_role[]));

-- No INSERT/DELETE policy: units are seeded by admin via service role.

-- ----- unit_memberships --------------------------------------------------
-- Members of a unit can see who else is in the unit. Presidency manages.

create policy unit_memberships_select_by_unit
  on public.unit_memberships for select
  using (unit_id in (select app.accessible_units()));

create policy unit_memberships_insert_by_presidency
  on public.unit_memberships for insert
  with check (app.has_unit_role(unit_id, array['presidency','admin']::public.unit_membership_role[]));

create policy unit_memberships_update_by_presidency
  on public.unit_memberships for update
  using (app.has_unit_role(unit_id, array['presidency','admin']::public.unit_membership_role[]))
  with check (app.has_unit_role(unit_id, array['presidency','admin']::public.unit_membership_role[]));

create policy unit_memberships_delete_by_presidency
  on public.unit_memberships for delete
  using (app.has_unit_role(unit_id, array['presidency','admin']::public.unit_membership_role[]));

-- ----- members -----------------------------------------------------------
-- Read by any unit member; mutations by presidency only.

create policy members_select_by_unit
  on public.members for select
  using (unit_id in (select app.accessible_units()));

create policy members_insert_by_presidency
  on public.members for insert
  with check (app.has_unit_role(unit_id, array['presidency','admin']::public.unit_membership_role[]));

create policy members_update_by_presidency
  on public.members for update
  using (app.has_unit_role(unit_id, array['presidency','admin']::public.unit_membership_role[]))
  with check (app.has_unit_role(unit_id, array['presidency','admin']::public.unit_membership_role[]));

create policy members_delete_by_presidency
  on public.members for delete
  using (app.has_unit_role(unit_id, array['presidency','admin']::public.unit_membership_role[]));

-- ----- activities --------------------------------------------------------
-- Any leader in the unit can plan/edit activities; presidency can delete.

create policy activities_select_by_unit
  on public.activities for select
  using (unit_id in (select app.accessible_units()));

create policy activities_insert_by_unit
  on public.activities for insert
  with check (unit_id in (select app.accessible_units()));

create policy activities_update_by_unit
  on public.activities for update
  using (unit_id in (select app.accessible_units()))
  with check (unit_id in (select app.accessible_units()));

create policy activities_delete_by_presidency
  on public.activities for delete
  using (app.has_unit_role(unit_id, array['presidency','admin']::public.unit_membership_role[]));

-- ----- attendance --------------------------------------------------------

create policy attendance_select_by_unit
  on public.attendance for select
  using (unit_id in (select app.accessible_units()));

create policy attendance_insert_by_unit
  on public.attendance for insert
  with check (unit_id in (select app.accessible_units()));

create policy attendance_update_by_unit
  on public.attendance for update
  using (unit_id in (select app.accessible_units()))
  with check (unit_id in (select app.accessible_units()));

create policy attendance_delete_by_presidency
  on public.attendance for delete
  using (app.has_unit_role(unit_id, array['presidency','admin']::public.unit_membership_role[]));

-- ----- lessons -----------------------------------------------------------

create policy lessons_select_by_unit
  on public.lessons for select
  using (unit_id in (select app.accessible_units()));

create policy lessons_insert_by_unit
  on public.lessons for insert
  with check (unit_id in (select app.accessible_units()));

create policy lessons_update_by_unit
  on public.lessons for update
  using (unit_id in (select app.accessible_units()))
  with check (unit_id in (select app.accessible_units()));

create policy lessons_delete_by_presidency
  on public.lessons for delete
  using (app.has_unit_role(unit_id, array['presidency','admin']::public.unit_membership_role[]));

-- ----- usage_events (append-only) ---------------------------------------
-- Read restricted to presidency for cost/transparency review. Writes
-- happen exclusively via the service-role-backed agent wrapper; with no
-- INSERT/UPDATE/DELETE policies declared, RLS denies those for normal
-- authenticated users by default (service_role bypasses RLS).

create policy usage_events_select_by_presidency
  on public.usage_events for select
  using (app.has_unit_role(unit_id, array['presidency','admin']::public.unit_membership_role[]));

-- ----- audit_events (append-only) ---------------------------------------

create policy audit_events_select_by_presidency
  on public.audit_events for select
  using (app.has_unit_role(unit_id, array['presidency','admin']::public.unit_membership_role[]));

-- ----- agent_suggestions ------------------------------------------------

create policy agent_suggestions_select_by_unit
  on public.agent_suggestions for select
  using (unit_id in (select app.accessible_units()));

create policy agent_suggestions_insert_by_unit
  on public.agent_suggestions for insert
  with check (unit_id in (select app.accessible_units()));

create policy agent_suggestions_update_by_unit
  on public.agent_suggestions for update
  using (unit_id in (select app.accessible_units()))
  with check (unit_id in (select app.accessible_units()));

create policy agent_suggestions_delete_by_presidency
  on public.agent_suggestions for delete
  using (app.has_unit_role(unit_id, array['presidency','admin']::public.unit_membership_role[]));

commit;
