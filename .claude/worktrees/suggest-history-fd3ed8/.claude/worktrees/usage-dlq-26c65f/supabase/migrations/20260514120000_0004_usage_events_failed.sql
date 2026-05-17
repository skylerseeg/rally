-- ============================================================================
-- 0004 — usage_events_failed dead-letter table
-- ============================================================================
--
-- Dead-letter table for usage_events insert failures.
--
-- Background: P12 prod silent-failure post-mortem (see Decisions Log,
-- 2026-05-10). lib/anthropic/withUsage.ts previously swallowed
-- usage_events insert failures with a log-only .catch. On Vercel
-- serverless, log-only failure modes are invisible. Going forward,
-- withUsage now:
--   * In non-prod: rethrows so dev/CI catch the failure.
--   * In prod: writes to this table so we have a queryable signal.
--
-- Service role only. Application code never reads this; ops queries it
-- manually. RLS is enabled but no policies are defined — service role
-- bypasses RLS, every other role has zero access. Append-only by design.

begin;

create table public.usage_events_failed (
  id              uuid primary key default gen_random_uuid(),
  attempted_at    timestamptz not null default now(),
  agent_name      text not null,
  model           text not null,
  unit_id         uuid,
  user_id_raw     text,
  payload         jsonb not null,
  error_message   text not null,
  error_code      text,
  error_details   text
);

create index usage_events_failed_attempted_idx
  on public.usage_events_failed (attempted_at desc);

create index usage_events_failed_agent_attempted_idx
  on public.usage_events_failed (agent_name, attempted_at desc);

alter table public.usage_events_failed enable row level security;
-- No policies. Service role bypasses RLS; every other role has zero access.

comment on table public.usage_events_failed is
  'Append-only dead-letter for failed usage_events inserts. System-only. Service role bypasses RLS; no other role has access. Read manually for ops triage.';

commit;
