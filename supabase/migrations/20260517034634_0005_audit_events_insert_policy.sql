-- ============================================================================
-- 0005 — audit_events insert policy
-- ============================================================================
--
-- Background: P12 prod smoke (2026-05-17) showed that the "Use this"
-- suggestion flow successfully creates an activity but never lands a row in
-- audit_events. Root cause: audit_events has RLS enabled (0001) with a SELECT
-- policy only — no INSERT policy. The server action in
-- app/(app)/activities/suggest/actions.ts uses the user-scoped client, so
-- Postgres silently rejects the insert and the swallowed log line is the
-- only signal.
--
-- Fix shape: keep RLS, keep the user-scoped client, add a least-privilege
-- INSERT policy. The with-check clause forces actor_user_id = auth.uid(),
-- so a user cannot forge an entry attributed to someone else. Append-only
-- semantics are preserved by the absence of UPDATE/DELETE policies.

begin;

create policy audit_events_insert_by_actor
  on public.audit_events for insert
  with check (
    unit_id in (select app.accessible_units())
    and actor_user_id = auth.uid()
  );

commit;
