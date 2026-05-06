# Rally Architecture

Rally is a planning tool for LDS youth-leader presidencies — Young Men, Young Women, and Sunday School quorum/class advisors. The product surface is small (members, activities, attendance, lessons), but the data is sensitive: it concerns minors. The architecture is shaped by that constraint first and feature breadth second.

## High-level shape

```
   Browser ──▶ Next.js (App Router, server actions, RSC)
                  │
                  │  cookies-bound Supabase client (RLS enforced)
                  ▼
              Supabase ── Postgres (domain data, usage_events, audit_events)
                  │           Auth (magic link, future SSO)
                  │           Storage (private buckets: member photos)
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
- `id`, `unit_id`, `quorum_class` enum (`deacons` | `teachers` | `priests` | `beehive` | `mia_maid` | `laurel` | `sunday_school_<n>`), `first_name`, `last_name`, `preferred_name`, `birthdate`, `parent_contacts` (jsonb), `notes` (free text — never sent to agents unless schema opts in), `photo_object_id` (private bucket ref), `is_active`, `created_at`, `updated_at`.

### `activities`
A planned activity night (typically Wednesday night, but flexible).
- `id`, `unit_id`, `quorum_class`, `title`, `description`, `starts_at`, `ends_at`, `location`, `category` enum (`spiritual` | `service` | `social` | `physical` | `skill`), `planned_by`, `status` enum (`draft` | `confirmed` | `completed` | `cancelled`), `ai_suggested` boolean, `source_suggestion_id` nullable.

### `attendance`
- `id`, `unit_id`, `activity_id`, `member_id`, `status` enum (`present` | `excused` | `absent` | `unknown`), `recorded_by`, `recorded_at`.
- Unique `(activity_id, member_id)`.

### `lessons`
Sunday lessons or quorum/class instruction.
- `id`, `unit_id`, `quorum_class`, `taught_on` (date), `manual` enum (curriculum identifier — see "Open questions"), `manual_reference` (e.g. lesson title or section ref), `teacher_user_id`, `outline` (jsonb — produced by `lesson_planner`), `notes`.

### `usage_events`
One row per Claude call. Required, not optional.
- `id`, `unit_id`, `agent_name`, `model`, `input_tokens`, `output_tokens`, `cache_read_tokens`, `cache_creation_tokens`, `latency_ms`, `request_hash`, `user_hash` (SHA-256 of `user_id || unit_id || day_bucket`), `redaction_summary` (jsonb: counts of names/phones/emails/addresses stripped), `error_code` nullable, `created_at`.

### `audit_events`
Cross-cutting log for sensitive actions: member exports, role changes, membership changes, photo access.
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
| `first_name` + `last_name`         | Reduce to `preferred_name` or first name + last initial               |
| `birthdate`                        | Convert to `age_years`. Birthdate never leaves the DB.                |
| `phone`, `email`, `address`        | Drop entirely                                                         |
| `parent_contacts`                  | Drop entirely                                                         |
| `notes` free text                  | Drop unless the agent's `InputSchema` opts in (`includeNotes: true`) and even then run a regex pass to strip phone/email/address/full-name patterns |
| `photo_object_id`, photo URLs      | Drop entirely. Photos never go to Claude.                             |
| Member `id`                        | Replaced with a per-request opaque token; mapping kept server-side    |

The combination "full name + birthdate" is a hard fail: `redact()` throws if both are present in the same record after transformation.

### Logging

`usage_events` records counts only — how many names, phones, emails, addresses were stripped — not the values. The prompt body is hashed (SHA-256) and the hash is stored, never the body.

---

## Open Questions (need owner input)

- Exact role taxonomy: confirm `leader` vs `presidency` is the right split, or whether we want separate `advisor`, `secretary`, `president` roles.
- Quorum/class enum: confirm the set above and whether Sunday School classes need finer granularity than `sunday_school_<n>`.
- Which lesson manuals to seed in `data/` for v1: *Come, Follow Me* (current year), Aaronic Priesthood/Young Women supplements, or a narrower set?
- Photo handling: confirm we want photos at all in v1, given the privacy posture.
- SSO: timeline for Church account integration — affects whether we invest in the magic-link flow polish now.
