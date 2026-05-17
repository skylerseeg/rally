-- Allow system-level (non-unit-scoped) usage events. Smoke tests, ops batch
-- jobs, model warmups, and any future cross-tenant operations need to log
-- without a unit context. Silent-skipping was the prior behavior and produced
-- accounting blind spots.
alter table public.usage_events
  alter column unit_id drop not null;

comment on column public.usage_events.unit_id is
  'Tenant scope for the call. NULL for system-level operations (batch jobs, smoke tests, ops). Application-level callers should always provide a unit_id when one exists.';
