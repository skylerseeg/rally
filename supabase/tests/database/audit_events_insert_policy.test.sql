-- ============================================================================
-- audit_events INSERT policy — pgTAP coverage
-- ============================================================================
--
-- Regression test for the missing-INSERT-policy bug found in the P12 prod
-- smoke (2026-05-17). Without an INSERT policy on a row-level-security-enabled
-- table, Postgres silently rejects writes from non-service roles. The previous
-- server action logged-and-swallowed the rejection, so the only signal that
-- the audit row never landed was a count(*) = 0 in production.
--
-- This test covers the three scenarios that matter for the policy:
--   1. authenticated user writes a row attributed to themselves, in a unit
--      they belong to — must succeed.
--   2. authenticated user attempts to forge the actor_user_id (attribute the
--      row to a different user) — must be rejected.
--   3. authenticated user attempts to insert into a unit they do not belong
--      to — must be rejected.
--
-- Run with: supabase test db
--
-- The whole test runs inside a single transaction that pgTAP rolls back, so
-- the fixture rows are not persisted.

begin;
select plan(3);

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------

-- `on conflict do nothing` guards against pre-existing rows from a previous
-- session that didn't cleanly roll back (e.g. ad-hoc psql work in local
-- dev). pgTAP's outer rollback still removes any *new* state.

insert into auth.users (id, instance_id, email, aud, role, encrypted_password, email_confirmed_at)
values ('11111111-1111-1111-1111-111111111111'::uuid,
        '00000000-0000-0000-0000-000000000000'::uuid,
        'pgtap-leader@rally.test', 'authenticated', 'authenticated',
        crypt('x', gen_salt('bf')), now())
on conflict (id) do nothing;

insert into public.units (id, name)
values ('a1111111-1111-1111-1111-111111111111'::uuid, 'pgTAP Unit A'),
       ('b2222222-2222-2222-2222-222222222222'::uuid, 'pgTAP Unit B')
on conflict (id) do nothing;

insert into public.unit_memberships (user_id, unit_id, role)
values ('11111111-1111-1111-1111-111111111111'::uuid,
        'a1111111-1111-1111-1111-111111111111'::uuid,
        'leader'::public.unit_membership_role)
on conflict (user_id, unit_id) do nothing;

-- ---------------------------------------------------------------------------
-- Switch to the authenticated role with the user's JWT sub claim. This is
-- what supabase-js does when serving a logged-in user's request through
-- PostgREST, so it exercises the same code path the server action hits.
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

-- ---------------------------------------------------------------------------
-- 1. Happy path
-- ---------------------------------------------------------------------------

select lives_ok(
  $$insert into public.audit_events
      (unit_id, actor_user_id, action, target_table, target_id, metadata)
    values
      ('a1111111-1111-1111-1111-111111111111'::uuid,
       '11111111-1111-1111-1111-111111111111'::uuid,
       'activity_suggestion_used', 'agent_suggestions',
       'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid,
       '{"index":0,"title":"Test"}'::jsonb)$$,
  'authenticated user can insert audit_event for own unit with own actor_user_id'
);

-- ---------------------------------------------------------------------------
-- 2. Forged actor_user_id
-- ---------------------------------------------------------------------------

select throws_ok(
  $$insert into public.audit_events
      (unit_id, actor_user_id, action, target_table)
    values
      ('a1111111-1111-1111-1111-111111111111'::uuid,
       '99999999-9999-9999-9999-999999999999'::uuid,
       'forged', 'agent_suggestions')$$,
  '42501',
  'new row violates row-level security policy for table "audit_events"',
  'authenticated user cannot forge actor_user_id of a different user'
);

-- ---------------------------------------------------------------------------
-- 3. Foreign unit_id (no membership)
-- ---------------------------------------------------------------------------

select throws_ok(
  $$insert into public.audit_events
      (unit_id, actor_user_id, action, target_table)
    values
      ('b2222222-2222-2222-2222-222222222222'::uuid,
       '11111111-1111-1111-1111-111111111111'::uuid,
       'unauthorized', 'agent_suggestions')$$,
  '42501',
  'new row violates row-level security policy for table "audit_events"',
  'authenticated user cannot insert audit_event into a unit they do not belong to'
);

select * from finish();
rollback;
