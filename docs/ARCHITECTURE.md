# Rally Architecture

Rally is a planning tool for LDS youth-leader presidencies — Young Men, Young Women, and Sunday School quorum/class advisors. The product surface is small (members, activities, attendance, lessons), but the data is sensitive: it concerns minors. The architecture is shaped by that constraint first and feature breadth second.

## High-level shape

```
   Browser ──▶ Next.js (App Router, server actions, RSC)
                  │
                  │  cookies-bound Supabase client (RLS enforced)
                  ▼
              Supabase ── Postgres (domain data, usage_events, audit_events)
                  │           Auth (magic link + Google OAuth; Church SSO post-v1)
                  │
                  └── workers/ (cron, queue, service-role)
                  
   Server actions ──▶ lib/redact.ts ──▶ agents/* ──▶ Anthropic API
                                            │
                                            └─ usage_events (hashed)
```

The browser never talks to Anthropic. Every Claude call originates server-side from an `agents/*` module, behind redaction, behind auth, behind RLS.

---

## Data Model

Tables are listed in dependency order. Every domain table has `unit_id`, `created_at`, `updated_at`, RLS enabled, and policies based on `app.accessible_units()`.

### `units`
The tenant. Represents a ward or branch.
- `id`, `name`, `stake_name`, `unit_number` (church-issued), `timezone`, `created_at`.

### `unit_memberships`
Joins `auth.users` to `units` with a role.
- `user_id`, `unit_id`, `role` enum (`leader` | `presidency` | `admin`), `calling_title` (free text — "Young Men 1st Counselor"), `created_at`.

### `members`
Youth tracked by leaders. **Not** auth users.
- `id`, `unit_id`, `quorum_class` enum (`deacons` | `teachers` | `priests` | `yw_12_13` | `yw_14_15` | `yw_16_17` | `sunday_school`), `first_name`, `last_name`, `preferred_name`, `birthdate`, `parent_contacts` (jsonb), `notes` (free text — never sent to agents unless schema opts in), `is_active`, `created_at`, `updated_at`.
- v1 does **not** store member photos. No `photo_object_id`; no Storage bucket for member photos.

### `activities`
A planned activity night (typically Wednesday night, but flexible).
- `id`, `unit_id`, `quorum_class`, `title`, `description`, `starts_at`, `ends_at`, `location`, `category` enum (`spiritual` | `service` | `social` | `physical` | `skill`), `planned_by`, `status` enum (`draft` | `confirmed` | `completed` | `cancelled`), `ai_suggested` boolean, `source_suggestion_id` nullable.

### `attendance`
- `id`, `unit_id`, `activity_id`, `member_id`, `status` enum (`present` | `excused` | `absent` | `unknown`), `recorded_by`, `recorded_at`.
- Unique `(activity_id, member_id)`.

### `lessons`
Sunday lessons or quorum/class instruction.
- `id`, `unit_id`, `quorum_class`, `taught_on` (date), `manual` enum (`come_follow_me_<year>` for v1; expand when AP/YW supplements ship), `manual_reference` (e.g. lesson title or section ref), `teacher_user_id`, `outline` (jsonb — produced by `lesson_planner`), `notes`.

### `usage_events`
One row per Claude call. Required, not optional.
- `id`, `unit_id`, `agent_name`, `model`, `input_tokens`, `output_tokens`, `cache_read_tokens`, `cache_creation_tokens`, `latency_ms`, `request_hash`, `user_hash` (SHA-256 of `user_id || unit_id || day_bucket`), `redaction_summary` (jsonb: counts of names/phones/emails/addresses stripped), `error_code` nullable, `created_at`.

### `audit_events`
Cross-cutting log for sensitive actions: member exports, role changes, membership changes.
- `id`, `unit_id`, `actor_user_id`, `action`, `target_table`, `target_id`, `metadata` (jsonb), `created_at`.

### `agent_suggestions`
Persisted output of agent runs that produce something a leader will accept/reject.
- `id`, `unit_id`, `agent_name`, `input_hash`, `output` (jsonb, validated), `accepted_by` nullable, `accepted_at` nullable, `created_at`.

---

## AI Surface

All agents live under `agents/`. Each has its own directory and follows the contract in `agents/README.md`.

### Shipping (v1)

- **`activity_suggester`** — given a quorum/class, recent activities, themes the presidency wants to hit, and seasonal constraints, returns 3–5 activity ideas with category, materials, prep effort, and a one-paragraph rationale. Default model: `claude-sonnet-4-5`.
- **`lesson_planner`** — given a lesson manual reference and the quorum/class profile (size, age range, recent topics, attendance trend at an aggregate level), returns a lesson outline: hook, scripture readings, discussion questions, application activity, closing. Default: `claude-sonnet-4-5`. Optional "deep" mode behind a flag uses `claude-opus-4-5`.
- **`member_insights`** — aggregates attendance trends and activity-category coverage for a quorum/class and returns presidency-facing observations. Operates on aggregates only — never on individual member records. Default: `claude-haiku-4-5`.

### Planned (v2+)

- **`ministering_planner`** — pairs members thoughtfully for ministering assignments given constraints. Requires extra-sensitive PII handling; design pending.
- **`testimony_safety_reviewer`** — internal moderation pass over leader-authored notes before they're surfaced in shared views. `claude-haiku-4-5`.

---

## AI calls and accounting

Every Claude call routes through `lib/anthropic/withUsage`. The wrapper does four things every time:

1. **Tier → model** via `lib/anthropic/models.ts`. Agents request a tier (`cheap` / `default` / `deep`); the registry maps to the concrete model string. Update model IDs in one place, never grep across `agents/`.
2. **Calls the SDK** with our defaults (`max_tokens: 1024`, `temperature: 0.7`) and any `tools` / `tool_choice` the caller passes for forced structured output.
3. **Hashes the request body** (SHA-256 over `system + messages + tools + tool_choice + maxTokens + temperature + model`) and stores the hash in `usage_events.request_hash`. The body itself is never persisted.
4. **Hashes the user identity** (SHA-256 of `user_id || unit_id || day_bucket || RALLY_USAGE_HASH_SALT`) and stores the hash in `usage_events.user_hash` along with token counts, latency, and `error_code` (null on success).

**The redaction expectation is on the caller.** `withUsage` does not call `lib/redact.ts` — it cannot know what the agent considers safe. Each agent runs `redactMember` (or whatever shape applies) before constructing `messages`. Tests in `lib/redact.test.ts` enforce the dropping rules; this layer enforces logging.

**Cost analytics** live in `usage_events`. There's no UI yet — query directly via Studio / SQL Editor for now. A future prompt will surface per-agent cost per day in the presidency dashboard.

## Privacy / Redaction Pipeline

The pipeline that sits between any server-side caller and Anthropic:

```
caller(input)
    │
    ▼
redact(input)         ── strips/transforms PII per rules below
    │
    ▼
agent.run(redacted)   ── builds messages with cached system prompt + forced tool_choice
    │
    ▼
Anthropic API
    │
    ▼
OutputSchema.parse    ── validates structured tool-use response
    │
    ▼
withUsage logger      ── writes usage_events row with hashed identifiers
    │
    ▼
caller receives typed Output
```

### `lib/redact.ts` rules

| Field                              | Action                                                                |
|------------------------------------|-----------------------------------------------------------------------|
| `first_name` + `last_name`         | Drop `last_name` entirely. Carry `preferred_name` if set, else `first_name`. No last initial — see "Name handling" below. |
| `birthdate`                        | Convert to `age_years`. Birthdate never leaves the DB.                |
| `phone`, `email`, `address`        | Drop entirely                                                         |
| `parent_contacts`                  | Drop entirely                                                         |
| `notes` free text                  | Drop unless the agent's `InputSchema` opts in (`includeNotes: true`) and even then run a regex pass to strip phone/email/address/full-name patterns |
| Member `id`                        | Replaced with a per-request opaque token; mapping kept server-side    |

The combination "full name + birthdate" is a hard fail: `redact()` throws if both are present in the same record after transformation.

#### Name handling

We tightened the doc's earlier "first name + last initial" idea to **first name only** when the redactor implementation landed. A last initial leaks just enough information to disambiguate two members in the same quorum, which is exactly what we don't want flowing into a Claude prompt. The redactor carries `preferred_name` when set, otherwise the bare `first_name`, and never the last name in any form.

### Logging

`usage_events` records counts only — how many names, phones, emails, addresses were stripped — not the values. The prompt body is hashed (SHA-256) and the hash is stored, never the body.

---

## Decisions Log

Resolved scope decisions for v1. Update this list when a decision changes; do not delete entries — supersede them with a newer dated entry below.

- **2026-05-06 — Role taxonomy.** Keep three roles: `leader | presidency | admin`. Calling-specific titles ("Young Men 1st Counselor", "Beehive Advisor", "Sunday School Secretary") are stored in `unit_memberships.calling_title` as freeform text. We do **not** model `advisor`, `secretary`, or `president` as separate roles.
- **2026-05-06 — Quorum/class enum.** Final v1 set: `deacons | teachers | priests | yw_12_13 | yw_14_15 | yw_16_17 | sunday_school`. Sunday School is a single value for v1 — no per-class numbering. Revisit if a unit needs to plan multiple SS classes independently.
- **2026-05-06 — Lesson manuals.** Seed only *Come, Follow Me* for the current year under `data/`. Aaronic Priesthood and Young Women supplements stay out of the seed corpus until `lesson_planner` ships and we know what the planner actually consumes.
- **2026-05-06 — Photos.** No member photos in v1. The `members` table does **not** carry `photo_object_id`, and we do **not** create a Storage bucket for member photos. Reduces privacy surface area; revisit only if a leader-driven need surfaces.
- **2026-05-06 — Auth providers.** v1 ships with Supabase Auth using magic link + Google OAuth. Church account SSO is post-v1. Auth helpers in `lib/auth/` are written provider-agnostically — `requireLeader()` and friends never branch on provider; the magic-link form and OAuth button are the only provider-aware surfaces.
- **2026-05-06 — Redactor name policy.** The redactor (`lib/redact.ts`) carries first name only — never a last initial. This is stricter than the original prose in this doc and is now reflected in the redaction-rules table and the "Name handling" subsection above. Reasoning: a last initial is enough to disambiguate two members in the same quorum, which defeats the purpose of redacting in the first place.
- **Onboarding gap (2026-05-07):** New leaders cannot self-onboard. A `unit_memberships` row must be inserted manually via SQL after first sign-in. Invitations flow is prioritized immediately after P8 (Activities + Attendance) — before any agents. Bumped from P16 to P-next.
- **Anthropic foundation (2026-05-07):** Agents call into `lib/anthropic/withUsage`, never `@anthropic-ai/sdk` directly. Models are tiered (`cheap` / `default` / `deep`) and resolved in `lib/anthropic/models.ts`. Usage events are logged with a per-day-bucketed SHA-256 hash of `(user_id, unit_id, day, RALLY_USAGE_HASH_SALT)` — never the raw user id. The admin (service-role) Supabase client is used for `usage_events` writes; this is the explicit exception to the "service role only in workers/ and api/admin/" rule, documented because `lib/anthropic/` is treated as worker-side infrastructure.
- **Usage events allow null unit (2026-05-08):** `usage_events.unit_id` was
  `NOT NULL` and `withUsage` silently skipped logging when callers passed
  `unitId: null`. This produced accounting blind spots for system-level calls
  (batch jobs, smoke tests, ops). Migration 0003 drops the constraint;
  `withUsage` now logs every Anthropic call unconditionally. Application-level
  callers must still pass a real unit_id when one exists; null is reserved
  for genuinely unscoped operations.
- **LDS Tools / Member Tools API (2026-05-08):** Not integrating. The Church
  publishes no public API for ward directory or member data; any community
  library against `churchofjesuschrist.org` endpoints is reverse-engineered
  scraping. Rejected for four reasons: (1) ToS posture — using internal
  endpoints from a multi-leader app is outside acceptable use; (2) auth model
  would require leaders to share Church account credentials, which Rally
  cannot responsibly secure; (3) it inverts the trust boundary documented
  above — member PII would arrive via a third-party library before the
  redactor sees it; (4) reverse-engineered endpoints break unpredictably.
  Path forward: keep manual entry as the primary intake, add CSV import as a
  later prompt (a leader exports the official directory CSV from Member Tools
  and uploads), watch for an official credentialed API. Revisit only when one
  ships.
- **Telemetry failures must surface (2026-05-10):** `lib/anthropic/withUsage.ts`
  previously swallowed `usage_events` insert failures with a log-only `.catch`.
  On Vercel serverless, log-only failure modes are invisible. P12 prod
  verification surfaced this — agent calls succeeded, telemetry silently
  dropped, no symptom for ~2 days. Going forward, any state-changing
  operation that swallows errors in production must (a) rethrow in non-prod
  so dev/CI catch the failure, and (b) write to a queryable dead-letter
  table in prod. Pure log-and-forget is banned for state-changing ops.
  Implementation: `withUsage` now structured-logs (`event:
  write_usage_event_failed`) with full Supabase error context (code,
  details), rethrows when `NODE_ENV !== 'production'`, and writes to
  `usage_events_failed` (migration 0004) in production. The dead-letter
  insert itself is best-effort — failures there log and move on, so a
  telemetry hiccup never breaks the user-facing call.
- **Pre-merge env verification (2026-05-10):** Three prod silent failures
  in Rally traced to env config (swapped service-role/anon keys; localhost
  Site URL; empty-string Vercel env values from P12). Added
  `scripts/verify-prod-env.sh` to confirm every required key is present,
  non-empty, correctly shaped, and (for JWTs) holds the right role claim.
  Run before any PR touching `lib/anthropic/`, auth, or env-reading code.
  Not in CI yet — requires Vercel auth; documented as a manual pre-merge
  step.
