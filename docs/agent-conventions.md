# Agent Conventions

This is the short version. The contract is in [`agents/README.md`](../agents/README.md). Read both.

## Hard rules

1. **One directory per agent.** No shared "utils" agent module.
2. **Single entrypoint.** Each agent exports exactly one async function `run<PascalCaseName>(input)`.
3. **Forced tool use for structured output.** Set `tool_choice: { type: "tool", name: "..." }`. Don't ask the model to "respond in JSON."
4. **Prompt caching.** The system prompt content block is wrapped with `cache_control: { type: "ephemeral" }`. Keep the system prompt stable across calls — variable context goes in the user message.
5. **Validate the output.** Run the model's tool-use args through `OutputSchema.parse`. Treat parse failures as agent errors; do not silently fall back.
6. **Redact the input.** Call `redact()` from `lib/redact.ts` before building messages. Never pass a raw `members` row.
7. **Log every call.** Use `withUsage()` from `lib/anthropic/withUsage.ts`. It writes a `usage_events` row whether the call succeeds or fails.

## Model selection

| Agent type                    | Default model         | Notes                                      |
|-------------------------------|-----------------------|--------------------------------------------|
| Generation (activities, lessons) | `claude-sonnet-4-5` | Primary workhorse                          |
| Deep reasoning path           | `claude-opus-4-5`     | Behind a feature flag, for opt-in "deep" runs |
| Cheap classification / redaction QA | `claude-haiku-4-5` | Use for batch passes, summaries        |

Don't pin to dated model snapshots in agent code. Use the model alias above; if a specific version is required, define it once in `lib/anthropic/models.ts` so we update in one place.

## What goes where

- `prompt.ts` — `SYSTEM_PROMPT` string + `buildMessages(input)`. Pure; no SDK calls.
- `schema.ts` — `InputSchema`, `OutputSchema`, exported types.
- `tools.ts` — Anthropic tool definition(s). The output tool's `input_schema` mirrors `OutputSchema`.
- `agent.ts` — wires everything together via `withUsage()`.
- `index.ts` — re-exports.
- `__tests__/` — at least one test that runs against a recorded fixture (no live API in CI).

## Failure modes to handle

- Model returns no tool use → throw `AgentRefusalError`.
- Tool args fail Zod parse → throw `AgentSchemaError`, log raw response hash to `usage_events.error_code`.
- Anthropic API 429 / 529 → retry with jittered backoff, max 3 tries, surface as `AgentRateLimitError`.
- Redaction throws → propagate. Never call the API on un-redactable input.
