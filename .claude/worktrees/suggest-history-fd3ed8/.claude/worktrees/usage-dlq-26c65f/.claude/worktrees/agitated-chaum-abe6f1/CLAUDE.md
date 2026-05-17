# CLAUDE.md

Guidance for Claude Code working in this repository. Read this before making changes.

Rally is a private planning app for Latter-day Saint youth leaders (Young Men, Young Women, and Sunday School quorum/class presidencies and advisors). Leaders track members, plan activities, manage attendance, and get AI-assisted activity and lesson suggestions tailored to their group.

Stack: Next.js (App Router) + Supabase (Postgres + Auth + Storage) + Anthropic Claude.

---

## Repository Layout

```
rally/
├── app/          Next.js App Router — routes, server actions, route handlers
├── components/   React components — ui/ for shadcn primitives, feature dirs otherwise
├── lib/          Shared client/server code — supabase clients, auth helpers, api wrappers
├── agents/       Claude agent modules — one directory per agent, each exporting a single entrypoint
├── workers/      Background jobs — cron tasks, queue handlers, scheduled redactors
├── supabase/     migrations/, seed.sql, generated TypeScript types
├── docs/         ARCHITECTURE.md, auth-env.md, agent-conventions.md
└── data/         Static reference data — lesson manuals, activity templates, scripture refs
```

---

## Common Commands

### Next.js

```bash
pnpm dev          # local dev server on :3000
pnpm build        # production build
pnpm start        # run built app
pnpm lint         # eslint
pnpm typecheck    # tsc --noEmit
pnpm format       # prettier --write
```

### Supabase CLI (local stack only — see "Don't" below)

```bash
supabase start                                              # boot local Postgres + Auth + Storage
supabase stop
supabase db reset                                           # wipe local DB + re-run migrations + seed
supabase migration new <name>                               # new timestamped migration in supabase/migrations
supabase db diff -f <name>                                  # generate migration from local changes
supabase gen types typescript --local > supabase/types.ts   # regenerate DB types after migrations
```

**Don't** run `supabase link`, `supabase db push --linked`, or anything else that targets the hosted project from this machine. Production migrations go through CI.

### Tests

```bash
pnpm test          # vitest run
pnpm test:watch    # vitest watch
pnpm test:e2e      # playwright (when configured)
```

---

## Architecture — The Big Picture

Rally is a **multi-tenant** app. The tenant is a **unit** (an LDS ward or branch). Every domain row carries `unit_id` and is gated by RLS.

- A **leader** (auth user) is scoped to one or more units via `unit_memberships`, with a role per unit (`leader`, `presidency`, `admin`).
- A **member** (youth) belongs to exactly one unit and one quorum/class within that unit. Members are **not** auth users — they are records leaders manage.
- **Activities** and **lessons** are planned per unit + quorum/class. **Attendance** is per activity per member.
- The **AI surface** (agents in `agents/`) is the only path that sends member-derived data outside Supabase. Every call is logged.

### Trust boundary

Youth PII (full name, birthdate, contact, parent contact, addresses, photos) **never leaves Supabase except through an explicit, logged AI call**, and even then only after passing through `lib/redact.ts`. There is no analytics SDK, no error reporter that captures request bodies, no third-party tag manager. If you're about to add one — stop and read `docs/ARCHITECTURE.md` first.

---

## Multi-tenancy Model

- Tenant = `units.id`. Every domain table has a `unit_id uuid not null references units(id)`.
- **Every** table gets RLS enabled and a policy. No exceptions. A migration that creates a table without `enable row level security` will fail review.
- The canonical access predicate is `unit_id in (select unit_id from unit_memberships where user_id = auth.uid())`. Define it once as a SQL function `app.accessible_units()` and reuse.
- Server code never bypasses RLS by default. The service-role key is used only in `workers/` and explicit admin scripts, never in user-facing request handlers.
- Helper: `lib/auth/units.ts` exports `getAccessibleUnits()` and `requireUnitAccess(unitId, role?)`. Server actions and route handlers must call one of these before reading domain data.

**Do**: derive `unit_id` from the authenticated user's membership.
**Don't**: accept `unit_id` from the client without verifying membership.

---

## Auth

- Supabase Auth — v1 ships with email magic link **and** Google OAuth. Church account SSO is post-v1. Design auth helpers provider-agnostically; only the login UI knows which providers exist.
- Sessions live in cookies. Server components read the user via `createServerClient` from `@supabase/ssr` (wrapped in `lib/supabase/server.ts`).
- Role gates: `leader` (default), `presidency` (can edit unit-wide settings, manage members), `admin` (cross-unit, internal). Roles are per-unit, stored on `unit_memberships.role`. Calling-specific titles (e.g. "Young Men 1st Counselor") go in `unit_memberships.calling_title` as freeform text — they do not gate permissions.
- Middleware refreshes the session cookie on every request. Pages that require auth call `requireLeader()` from `lib/auth/guards.ts`.

---

## Agents

Every Claude-backed feature lives in `agents/<name>/` and follows the contract in `agents/README.md`. Summary:

- One directory per agent. Required files: `agent.ts` (entrypoint), `prompt.ts` (system prompt as a string), `schema.ts` (Zod input/output schemas), `tools.ts` (tool definitions if any).
- Each agent exports a single async function `run<AgentName>(input)` that returns a parsed, typed result.
- **Structured output** is produced by forcing `tool_choice: { type: "tool", name: "..." }` against a single declared tool whose `input_schema` is the desired output shape. Don't ask Claude to "return JSON" in prose.
- The system prompt is wrapped in a content block with `cache_control: { type: "ephemeral" }` so prompt caching kicks in across calls.
- Default model: `claude-sonnet-4-5`. Use `claude-haiku-4-5` for cheap classification/redaction passes. Reserve `claude-opus-4-5` for the lesson planner's deep-reasoning path, behind a feature flag.
- After every call, write a row to `usage_events` with: hashed user id, unit id, agent name, model, input tokens, output tokens, cache read/creation tokens, latency ms, and a request hash. The shared wrapper in `lib/anthropic/withUsage.ts` does this — agents must use it.

---

## Conventions

- **TypeScript strict** everywhere. No `any` without an inline `// reason:` comment.
- **Zod** validates every input that crosses a trust boundary: server action args, route handler bodies, agent inputs, agent outputs (yes, validate the model's response).
- Prefer **server actions** over API routes. Use route handlers only for webhooks, streaming, or non-form clients.
- `createClient` is called in **exactly two places**: `lib/supabase/server.ts` (cookies-aware, RLS-respecting) and `lib/supabase/client.ts` (browser). Importing `@supabase/supabase-js` directly anywhere else is a review-blocker.
- Service-role usage lives in `lib/supabase/admin.ts` and may only be imported from `workers/` or files under `app/api/admin/`.
- Error handling: throw typed errors from `lib/errors.ts`; don't swallow.
- Logs go through `lib/log.ts`. Never log raw member rows.

---

## Privacy Rules (Hard)

These are non-negotiable. A PR that violates one gets reverted.

1. **Never** include a youth's full name and birthdate in the same Claude prompt. If the agent needs age, send age in years; if it needs a name, send a first name or initials.
2. **Redact before send.** All outbound prompts pass through `lib/redact.ts`, which strips: full names → initials, phone numbers, email addresses, street addresses, parent/guardian names, and any free-text "notes" field unless the agent explicitly opted in via its schema.
3. **Log every AI request** to `usage_events`: SHA-256 of `user_id || unit_id || day_bucket` (not the raw IDs), unit id, agent, model, token counts, redaction summary, prompt hash. Never log the prompt body.
4. v1 does not store member photos. If a future version reintroduces them, photos live in a private Storage bucket with signed-URL access only and are **never** sent to Claude.
5. Exports of member data require a `presidency` role and are written to `audit_events`.
6. No third-party analytics, session replay, or error reporters that capture request/response bodies. Server-side error reporting is allowed if it scrubs by allowlist.

---

## Git Workflow

- Default branch: `main`. Protected.
- Feature branches: `claude/<short-task-slug>-<random>` for Claude-driven work, `<initials>/<slug>` for human work.
- One logical change per PR. Migrations get their own PR when feasible.
- Every PR runs `pnpm lint`, `pnpm typecheck`, `pnpm test`, and a Supabase migration dry-run.
- Don't push to `main` directly. Don't force-push shared branches.
