# Rally

Private planning app for Latter-day Saint youth leaders. Track members, plan activities, manage attendance, and get AI-assisted suggestions tailored to your quorum or class.

**Stack:** Next.js 16 (App Router) · Supabase (Postgres + Auth) · Anthropic Claude · Tailwind CSS.

For architecture, conventions, and privacy rules read [`CLAUDE.md`](./CLAUDE.md), [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md), and [`docs/auth-env.md`](./docs/auth-env.md).

---

## Prerequisites

- **Node 22+** (`node --version`)
- **pnpm 10+** (`pnpm --version`) — `npm i -g pnpm` if missing
- **Supabase CLI** — install via `brew install supabase/tap/supabase` or see [Supabase docs](https://supabase.com/docs/guides/cli)
- **Docker Desktop** (or another Docker engine) — required by `supabase start`
- **An Anthropic API key** — only needed once you start running agents

---

## First-time setup

```bash
git clone git@github.com:skylerseeg/rally.git
cd rally
pnpm install
cp .env.example .env.local
```

Fill in `.env.local`:

```bash
# Supabase (public, RLS-bounded)
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<paste from `supabase status` after starting>

# Supabase (server-only, bypasses RLS — only used by workers/ and admin scripts)
SUPABASE_SERVICE_ROLE_KEY=<paste from `supabase status` after starting>

# Anthropic (server-only). Optional for now; required when agents run.
ANTHROPIC_API_KEY=

# App secrets
RALLY_ENCRYPTION_KEY=<base64 of 32 random bytes>
RALLY_USAGE_HASH_SALT=<any random string; rotation breaks usage_events correlation>
```

Generate `RALLY_ENCRYPTION_KEY` quickly:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

---

## Boot the local stack

```bash
supabase start          # boots Postgres + Auth on :54321 / :54322
supabase status         # prints the anon + service-role keys → paste into .env.local
supabase db reset       # applies all migrations + supabase/seed.sql (Mapleton 34th + 11 deacons)
```

Then in a second terminal:

```bash
pnpm dev                # Next.js on :3000
```

Visit [http://localhost:3000](http://localhost:3000) — you'll be redirected to `/login`.

---

## Sign in for the first time

1. Submit your email at `/login`. Supabase sends a magic link.
2. Click the link. You'll bounce through `/auth/callback` and land on `/onboarding/no-access` — that's expected; you don't have a `unit_memberships` row yet.
3. Tie yourself to the seeded ward as a presidency member. Find your `auth.users.id` in **Studio → Authentication** (http://127.0.0.1:54323) or run:

   ```sql
   select id, email from auth.users;
   ```

4. Insert the membership in **Studio → SQL Editor**:

   ```sql
   insert into unit_memberships (user_id, unit_id, role, calling_title)
   values (
     '<your-auth-uid>',
     '00000000-0000-0000-0000-000000000010',
     'presidency',
     'Quorum Advisor'
   );
   ```

5. Refresh `/`. You should see the dashboard with 11 active members and "Mapleton 34th Ward" up top.

---

## Daily commands

```bash
pnpm dev          # start Next.js dev server (Turbopack)
pnpm typecheck    # tsc --noEmit
pnpm test         # vitest run
pnpm test:watch   # vitest watch mode
pnpm lint         # ⚠ broken on Next 16 — `next lint` was removed; rely on typecheck + tests until a flat-config eslint script replaces it
pnpm format       # prettier --write
pnpm build        # production build
```

Supabase (local stack only — never `--linked`):

```bash
supabase start
supabase stop
supabase status
supabase db reset                                          # nuke local DB + re-run migrations + seed
supabase migration new <slug>                              # new timestamped migration
supabase db diff -f <slug>                                 # generate from current local state
supabase gen types typescript --local > supabase/types.ts  # regenerate DB types
```

---

## Common workflows

### Add a database migration

Use the `/new-migration` slash command in Claude Code, or do it by hand:

```bash
supabase migration new <snake_case_slug>
# edit the new file under supabase/migrations/
supabase db reset
supabase gen types typescript --local > supabase/types.ts
```

Every domain table needs `unit_id`, RLS enabled, and policies using `app.accessible_units()` — see the boilerplate in [`.claude/commands/new-migration.md`](./.claude/commands/new-migration.md).

### Add a Claude agent

```bash
# /new-agent <agent_name> "<one-line purpose>"
```

The slash command scaffolds `agents/<name>/{index,prompt,schema,redact}.ts` plus a `__tests__/` directory with redaction + `withUsage()` wired in. Read [`agents/README.md`](./agents/README.md) for the contract.

### Generate activity suggestions in the UI

Once you're signed in with a `unit_memberships` row:

1. Visit `/activities` and click **Suggest with AI** (top-right).
2. Pick a target date (defaults to next Wednesday), optional category, and any free-text constraints.
3. Claude returns 3–7 suggestions in 6–12 seconds. The full batch persists to `agent_suggestions` (RLS-gated by unit).
4. Click **Use this** on a card — you land on `/activities/new` pre-filled (title, description, category, starts_at @ 7pm). The click also writes an `audit_events` row with `action = 'activity_suggestion_used'`.
5. Save the activity. `activities.source_suggestion_id` links back to the row and `ai_suggested` flips to `true` — that's how we'll measure agent usefulness over time.

Telemetry: every Anthropic call writes to `usage_events` via `lib/anthropic/withUsage` regardless of the user's session. The hashed user id is `sha256(user_id || unit_id || day_bucket || RALLY_USAGE_HASH_SALT)` — never the raw uuid.

### Apply changes to the hosted project

A migration on disk does **not** mean a migration on hosted. After a migration PR merges, the maintainer pushes it to the linked hosted Supabase project from a trusted machine:

```bash
supabase db push
```

Confirm the change landed by checking the column / table in **Studio → SQL Editor** or running a quick query against the hosted project. The Anthropic dead-letter table (`usage_events_failed`) is a good recent example of why this verification step matters — a migration that exists in `supabase/migrations/` but hasn't been pushed will look fine in dev and silently break in prod.

Claude Code sessions don't run `supabase db push` themselves; see CLAUDE.md "Git Workflow".

Seed updates land the same way (`supabase db push` re-applies migrations only — to update seed data on hosted, paste `supabase/seeds/<file>.sql` into the hosted project's SQL Editor).

### Open a PR

Branches: `claude/<slug>-<random>` for AI-driven work, `<initials>/<slug>` for human work. PRs target `main` and run `pnpm lint`, `pnpm typecheck`, `pnpm test`, plus a Supabase migration dry-run when CI lands.

---

## Repo layout

```
rally/
├── app/                 Next.js App Router (auth pages, /(app)/ shell, /api/*)
├── components/          ui/ primitives + shell/ (AppShell, NavLink, UnitSwitcher, UserMenu)
├── lib/                 supabase clients, auth guards, redactor, formatters, errors, log
├── agents/              Claude agent modules (one dir per agent)
├── workers/             Background jobs (cron, queue handlers)
├── supabase/            migrations/, seed.sql, seeds/, generated types.ts
├── docs/                ARCHITECTURE.md, auth-env.md, agent-conventions.md
├── data/                Static reference data (activity_ideas.json, future lesson manuals)
└── .claude/             Claude Code config — settings.json + slash-command templates
```

---

## Troubleshooting

- **`supabase start` hangs** — Docker isn't running. Open Docker Desktop and retry.
- **`supabase db reset` errors on RLS policies** — usually a forgotten `enable row level security` in a new migration. Add it; rerun.
- **Magic-link email never arrives in dev** — check `supabase status` for the **Inbucket** URL (typically http://127.0.0.1:54324). All local emails land there.
- **`/auth/callback` says "auth"** — the redirect URL isn't allowlisted. In hosted projects, add `http(s)://<host>/auth/callback` under **Auth → URL Configuration**.
- **Dashboard shows the wrong unit** — clear the `rally_active_unit` cookie or click the unit switcher in the top nav.
- **`pnpm typecheck` red after a migration** — regenerate types: `supabase gen types typescript --local > supabase/types.ts`.

---

## Privacy reminders

These are non-negotiable; see CLAUDE.md "Privacy Rules (Hard)" for the full list:

- Never put a youth's full name **and** birthdate in the same Claude prompt. The redactor (`lib/redact.ts`) enforces this with a hard-fail.
- All outbound prompts go through `lib/redact.ts`. No exceptions.
- `usage_events` rows hash the user identifier — never store the raw `user_id` in logs.
- No third-party analytics, session-replay, or error reporters that capture request bodies.
