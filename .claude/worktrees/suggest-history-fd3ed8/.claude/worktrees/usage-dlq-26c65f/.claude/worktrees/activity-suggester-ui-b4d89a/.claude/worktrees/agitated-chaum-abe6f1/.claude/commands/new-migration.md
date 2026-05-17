---
description: Create a timestamped Supabase migration with RLS boilerplate
argument-hint: <migration_slug>
---

# /new-migration

Create a new Supabase migration at `supabase/migrations/<UTC-timestamp>_$1.sql`.

Inputs:
- `$1` — migration slug in `snake_case` (e.g. `add_attendance_table`, `index_activities_by_date`).

Steps:

1. Generate the timestamp prefix as `YYYYMMDDHHMMSS` in UTC.
2. Create the file with the following template, filling in `$1` and leaving the table-definition section as a TODO comment for me:

```sql
-- Migration: $1
-- Created: <UTC ISO timestamp>
--
-- Rally requires every domain table to:
--   1. carry a unit_id column
--   2. enable row level security
--   3. define policies using app.accessible_units()
--
-- Do not add a table without all three.

begin;

-- TODO: define schema changes here.
-- Example template for a new domain table:
--
-- create table public.<table> (
--   id          uuid primary key default gen_random_uuid(),
--   unit_id     uuid not null references public.units(id) on delete cascade,
--   created_at  timestamptz not null default now(),
--   updated_at  timestamptz not null default now(),
--   created_by  uuid references auth.users(id)
--   -- domain columns ...
-- );
--
-- create index <table>_unit_id_idx on public.<table> (unit_id);
--
-- alter table public.<table> enable row level security;
--
-- create policy "<table>_select_by_unit"
--   on public.<table> for select
--   using (unit_id in (select unit_id from public.unit_memberships where user_id = auth.uid()));
--
-- create policy "<table>_insert_by_unit"
--   on public.<table> for insert
--   with check (unit_id in (select unit_id from public.unit_memberships where user_id = auth.uid()));
--
-- create policy "<table>_update_by_unit"
--   on public.<table> for update
--   using (unit_id in (select unit_id from public.unit_memberships where user_id = auth.uid()))
--   with check (unit_id in (select unit_id from public.unit_memberships where user_id = auth.uid()));
--
-- create policy "<table>_delete_by_presidency"
--   on public.<table> for delete
--   using (exists (
--     select 1 from public.unit_memberships m
--     where m.user_id = auth.uid()
--       and m.unit_id = public.<table>.unit_id
--       and m.role in ('presidency','admin')
--   ));

commit;
```

3. After writing the file, remind me to:
   - Run `supabase db reset` locally to apply.
   - Run `supabase gen types typescript --local > supabase/types.ts` if the schema changed.
   - Add a row-level test under `supabase/tests/` if the table is new.

Do not run any `supabase` commands targeting the linked/hosted project. Local only.
