-- Migration: 0002_invitations
-- Created:   2026-05-07T22:26:19Z (UTC)
--
-- Email-based invitations. No opaque token: magic-link sign-in already
-- verifies email ownership, so invitations are just rows keyed on
-- (unit_id, email). When a user signs in, public.accept_pending_invitations()
-- materialises any pending invites for their email into unit_memberships.
--
-- Decisions:
--   * citext for case-insensitive email matching.
--   * `role` reuses the existing public.unit_membership_role enum.
--   * Policies use app.has_unit_role(...) (already in 0001) rather than
--     extending app.accessible_units(); the latter returns just unit ids
--     and adding a role column would change a function used everywhere.
--   * unit_memberships already has unique (user_id, unit_id) from 0001;
--     no alter table needed for the ON CONFLICT to work.
--   * The materialisation function lives in `public` (not `app`) so the
--     supabase-js client can call it via supabase.rpc(...) without
--     reconfiguring the schema.

begin;

create extension if not exists citext;

-- ========================================================================
-- invitations table
-- ========================================================================

create table public.invitations (
  id              uuid primary key default gen_random_uuid(),
  unit_id         uuid not null references public.units(id) on delete cascade,
  email           citext not null,
  role            public.unit_membership_role not null,
  calling_title   text,
  invited_by      uuid not null references auth.users(id) on delete restrict,
  expires_at      timestamptz not null default (now() + interval '14 days'),
  accepted_at     timestamptz,
  accepted_by     uuid references auth.users(id) on delete set null,
  revoked_at      timestamptz,
  revoked_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- One pending invite per (unit, email). Allow re-inviting after
-- acceptance/revocation.
create unique index invitations_unit_email_pending
  on public.invitations (unit_id, email)
  where accepted_at is null and revoked_at is null;

create index invitations_email_pending
  on public.invitations (email)
  where accepted_at is null and revoked_at is null;

create index invitations_unit_created
  on public.invitations (unit_id, created_at desc);

create trigger invitations_set_updated_at
  before update on public.invitations
  for each row execute function public.set_updated_at();

-- ========================================================================
-- Row Level Security
-- ========================================================================

alter table public.invitations enable row level security;

create policy invitations_select_unit_leaders
  on public.invitations for select
  using (
    app.has_unit_role(unit_id, array['presidency','admin']::public.unit_membership_role[])
  );

create policy invitations_insert_unit_leaders
  on public.invitations for insert
  with check (
    app.has_unit_role(unit_id, array['presidency','admin']::public.unit_membership_role[])
    and invited_by = auth.uid()
  );

create policy invitations_update_unit_leaders
  on public.invitations for update
  using (
    app.has_unit_role(unit_id, array['presidency','admin']::public.unit_membership_role[])
  )
  with check (
    app.has_unit_role(unit_id, array['presidency','admin']::public.unit_membership_role[])
  );

-- No DELETE policy: revocation is a soft action via revoked_at.

-- Grant table privileges so RLS policies can take effect for
-- authenticated users. (RLS without GRANT denies everything.)
grant select, insert, update on public.invitations to authenticated;

-- ========================================================================
-- public.accept_pending_invitations()
-- ========================================================================
--
-- SECURITY DEFINER so it can bypass RLS for the atomic "accept invite +
-- create membership" step. Idempotent: re-running for an already-
-- accepted invite is a no-op (the WHERE clause filters them out and
-- the membership insert ON CONFLICT does nothing).
--
-- Returns the number of invitations materialised on this call.

create or replace function public.accept_pending_invitations()
returns integer
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  user_uid uuid;
  user_email citext;
  materialised_count integer := 0;
  invite record;
begin
  user_uid := auth.uid();
  if user_uid is null then
    return 0;
  end if;

  select email::citext into user_email from auth.users where id = user_uid;
  if user_email is null then
    return 0;
  end if;

  for invite in
    select id, unit_id, role, calling_title
      from public.invitations
     where email = user_email
       and accepted_at is null
       and revoked_at is null
       and expires_at > now()
     for update
  loop
    insert into public.unit_memberships (user_id, unit_id, role, calling_title)
    values (user_uid, invite.unit_id, invite.role, invite.calling_title)
    on conflict (user_id, unit_id) do nothing;

    update public.invitations
       set accepted_at = now(),
           accepted_by = user_uid
     where id = invite.id;

    materialised_count := materialised_count + 1;
  end loop;

  return materialised_count;
end;
$$;

comment on function public.accept_pending_invitations() is
  'Looks up pending, non-expired, non-revoked invites for the calling user''s email and materialises them into unit_memberships. Idempotent. Returns the count materialised.';

revoke all on function public.accept_pending_invitations() from public;
grant execute on function public.accept_pending_invitations() to authenticated, service_role;

commit;
