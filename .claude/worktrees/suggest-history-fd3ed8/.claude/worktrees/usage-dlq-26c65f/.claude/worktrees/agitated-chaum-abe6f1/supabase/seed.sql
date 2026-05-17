-- supabase/seed.sql
-- Local-development seed. Applied automatically by `supabase db reset`.
--
-- Mirrors supabase/seeds/0001_mapleton_34th.sql, which is the file run by
-- hand against the hosted project via the Supabase SQL Editor. Keep them
-- in sync. (Single source: this file is included by 0001_mapleton_34th.sql
-- via copy-paste; if you change one, change the other.)
--
-- Scope (per the seed prompt):
--   * One unit: Mapleton 34th Ward.
--   * The 11 deacons of that unit, all quorum_class = 'deacons'.
--
-- NOT seeded here (intentional):
--   * unit_memberships — those need real auth.users.id values, which
--     only exist after a leader signs up. A separate bootstrap script
--     will tie a leader to this unit.
--   * activity_ideas — kept as static reference data in
--     data/activity_ideas.json (per CLAUDE.md: "Static reference data
--     — lesson manuals, activity templates, scripture refs"). The
--     activity_suggester agent will read it at runtime; no DB table is
--     required.

begin;

-- Idempotent: safe to re-run after `supabase db reset`.
insert into public.units (id, name, stake_name, unit_number, timezone)
values (
  '00000000-0000-0000-0000-000000000010',
  'Mapleton 34th Ward',
  'Mapleton Utah Maple Canyon Stake',
  null,
  'America/Denver'
)
on conflict (id) do update
  set name        = excluded.name,
      stake_name  = excluded.stake_name,
      unit_number = excluded.unit_number,
      timezone    = excluded.timezone;

-- 11 deacons, alphabetical by last name.
-- parent_contacts and notes deliberately empty for v1.
insert into public.members
  (unit_id, quorum_class, first_name, last_name, birthdate,
   parent_contacts, notes, is_active)
values
  ('00000000-0000-0000-0000-000000000010', 'deacons', 'Tyson',    'Barrio',     '2014-12-29', '[]'::jsonb, '{}'::jsonb, true),
  ('00000000-0000-0000-0000-000000000010', 'deacons', 'Bronson',  'Burgon',     '2013-08-29', '[]'::jsonb, '{}'::jsonb, true),
  ('00000000-0000-0000-0000-000000000010', 'deacons', 'Dallin',   'Hurless',    '2014-07-16', '[]'::jsonb, '{}'::jsonb, true),
  ('00000000-0000-0000-0000-000000000010', 'deacons', 'Sam',      'Jaramillo',  '2014-06-26', '[]'::jsonb, '{}'::jsonb, true),
  ('00000000-0000-0000-0000-000000000010', 'deacons', 'Bennett',  'Nelson',     '2014-05-01', '[]'::jsonb, '{}'::jsonb, true),
  ('00000000-0000-0000-0000-000000000010', 'deacons', 'Evan',     'Oldroyd',    '2013-01-25', '[]'::jsonb, '{}'::jsonb, true),
  ('00000000-0000-0000-0000-000000000010', 'deacons', 'Noah',     'Oldroyd',    '2013-01-25', '[]'::jsonb, '{}'::jsonb, true),
  ('00000000-0000-0000-0000-000000000010', 'deacons', 'Paceson',  'Sainsbury',  '2013-10-15', '[]'::jsonb, '{}'::jsonb, true),
  ('00000000-0000-0000-0000-000000000010', 'deacons', 'Lyric',    'Seegmiller', '2013-10-10', '[]'::jsonb, '{}'::jsonb, true),
  ('00000000-0000-0000-0000-000000000010', 'deacons', 'Cooper',   'Swenson',    '2014-11-21', '[]'::jsonb, '{}'::jsonb, true),
  ('00000000-0000-0000-0000-000000000010', 'deacons', 'Adam',     'Turley',     '2014-01-08', '[]'::jsonb, '{}'::jsonb, true)
on conflict do nothing;

commit;
