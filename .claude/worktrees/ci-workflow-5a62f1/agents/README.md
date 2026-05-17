# `agents/`

Every Claude-backed feature in Rally lives here. One directory per agent. The contract below is enforced by review — the `/new-agent` slash command scaffolds it correctly.

## File layout

```
agents/
└── <agent_name>/
    ├── index.ts          entrypoint: run<PascalCaseName>(input)
    ├── prompt.ts         buildSystem() + buildUserMessage(ctx, ...)
    ├── schema.ts         Zod schemas + the Anthropic tool definition (input_schema)
    ├── redact.ts         domain-specific redaction; composes lib/redact.ts primitives
    └── __tests__/        at minimum: redaction, schema, integration (Anthropic SDK mocked)
```

There is **no** `agent.ts` and no `tools.ts` — those are folded into `index.ts` and `schema.ts` respectively.

## Required exports

`agents/<name>/index.ts` must export:

- `run<PascalCaseName>(input: RunAgentInput): Promise<RunAgentResult>` — the single entrypoint. Takes `{ context, caller, ... }` and returns `{ output, usage }`.
- Input/result TypeScript types.

Zod schemas (`*OutputSchema`, etc.) live in `schema.ts`. Callers import them from `@/agents/<name>/schema` directly if they need to validate the model output. Helpers that span multiple agents go in `lib/`, not here.

## Redaction (hard wall)

Raw `members` rows are forbidden in prompts. Each agent has its own `redact.ts` that composes the primitives in `lib/redact.ts`:

- `redactMember(member, opts?)` / `redactMembers(...)` — first-name-only, age in years, opaque per-request id tokens, optional notes (scrubbed of phone/email/url/zip/address-shaped substrings).
- `scrubNotes(text)` — call this directly when you forward leader-written notes.
- `createTokenMapper(seed, salt?)` — token ↔ real id mapping for round-tripping suggestions back to members.
- `_assertNoNameAndDob(record)` — runtime guard that throws if a record carries both a name field and a date-shaped value. Belt-and-suspenders against accidentally re-introducing DOB.

The redacted context type is the **only** thing passed to `prompt.ts`.

## Model selection

Pull from `lib/anthropic/models.ts` via tiers — don't hardcode dated snapshots in the agent.

- `default` → `claude-sonnet-4-5` (most agents).
- `cheap` → `claude-haiku-4-5` (classification, redaction QA, summarisation).
- `deep` → `claude-opus-4-5` (lesson_planner deep-reasoning path, behind a feature flag).

## Prompt caching

`buildSystem()` returns a content-block array with `cache_control: { type: "ephemeral" }` so Anthropic caches the static portion across calls. Keep the system prompt stable per agent version; per-call context (redacted roster, recent activities, lesson refs) lives in the user message and is not cached.

## Structured output via forced tool use

Define one tool in `schema.ts` whose `input_schema` mirrors your Zod output schema. Force it via `tool_choice: { type: "tool", name: "<tool_name>" }`. Don't ask Claude to "return JSON" in prose — that's drift-prone.

After the call, validate the tool input against the Zod schema. If `tool_use` is missing or the parse fails, throw — translation to typed errors (`AgentRefusalError`, `AgentSchemaError`, `AgentRateLimitError` from `lib/errors.ts`) is the action-layer's job today; the agent itself just signals failure clearly.

## Usage logging (required)

Every call goes through `withUsage` from `@/lib/anthropic`:

```ts
const result = await withUsage<unknown>({
  agentName: "<agent_name>",
  tier: "default",
  system: buildSystem(),
  messages: [buildUserMessage(redacted, ...)],
  tools: [theTool as unknown as Anthropic.Messages.Tool],
  toolChoice: { type: "tool", name: "<tool_name>" },
  maxTokens: 2048,
  temperature: 0.8,
  context: { userId: caller.userId, unitId: caller.unitId },
});
```

`withUsage` writes a `usage_events` row with the SHA-256 of `user_id || unit_id || day_bucket || RALLY_USAGE_HASH_SALT` (per-day-bucketed; never the raw user id), unit id, agent name, model, token counts, latency, request hash, and `error_code`. `unit_id` may be `null` for system-level calls (batch jobs, smoke tests, ops).

The `usage_events` insert path is exempt from the "service-role only in `workers/` and `app/api/admin/`" rule; see the Decisions Log in `docs/ARCHITECTURE.md`.

## Reference implementation

`agents/activity_suggester/` is the canonical example — read it after this README. It:

- Builds a `SuggesterContextInput` from raw unit data, runs it through `redact.ts` before anything reaches `prompt.ts`.
- Forces the `suggest_activities` tool, parses the input with `suggesterOutputSchema`, throws on schema failure or missing tool use.
- Returns `{ output, usage }` so callers can both consume the parsed result and report on telemetry.

## Current agents

- **activity_suggester** — suggests 3–7 activities for a unit given recent history, member roster, and constraints. Tier: `default`. UI surface: `/activities/suggest`.

Planned (not yet implemented): `lesson_planner` (Come, Follow Me alignment + deep-reasoning opt-in).

## Testing

Each agent ships at least one test under `__tests__/` that mocks `@/lib/anthropic` (`withUsage`) and asserts the parsed output, redaction behavior, and the prompt envelope (e.g. "raw last names never appear in the user message"). CI runs with `ANTHROPIC_API_KEY` unset; tests must not hit the live API.
