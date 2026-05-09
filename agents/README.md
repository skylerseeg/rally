# `agents/`

Every Claude-backed feature in Rally lives here. One directory per agent. The contract below is enforced by review — the `/new-agent` slash command scaffolds it correctly.

## File layout

```
agents/
└── <agent_name>/
    ├── agent.ts          entrypoint: run<PascalCaseName>(input)
    ├── prompt.ts         SYSTEM_PROMPT + buildMessages(input)
    ├── schema.ts         Zod InputSchema, OutputSchema, types
    ├── tools.ts          Anthropic tool definitions
    ├── index.ts          re-exports
    └── __tests__/        fixture-based tests
```

## Required exports

`agents/<name>/index.ts` must export:

- `run<PascalCaseName>(input: Input): Promise<Output>` — the single entrypoint.
- `InputSchema`, `OutputSchema` — Zod schemas.
- `Input`, `Output` — inferred types.

Nothing else. No "helpers" leaking out of the directory; if multiple agents need the same helper, it lives in `lib/`.

## Model selection

- Default: `claude-sonnet-4-5`.
- Cheap classification / redaction QA / summarisation: `claude-haiku-4-5`.
- Deep-reasoning opt-in (lesson_planner deep mode): `claude-opus-4-5`, gated by a feature flag.

Don't hardcode dated snapshots in the agent. Pull from `lib/anthropic/models.ts`.

## Prompt caching

The system prompt is the cached portion. Pass it as a content block on the `system` field with `cache_control`:

```ts
system: [
  { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
],
```

Keep `SYSTEM_PROMPT` stable across calls. Per-call context (the redacted member roster, recent activities, lesson reference) goes in the user message — that part is not cached.

## Structured output via forced tool use

Define one tool whose `input_schema` matches `OutputSchema`. Force it:

```ts
tool_choice: { type: "tool", name: "emit_<agent_name>_result" },
```

Then validate:

```ts
const toolUse = response.content.find((b) => b.type === "tool_use");
if (!toolUse) throw new AgentRefusalError(...);
return OutputSchema.parse(toolUse.input);
```

## Usage logging (required)

Every call goes through `withUsage()`:

```ts
return withUsage(
  { agent: "activity_suggester", unitId, userId, model },
  async () => {
    const redacted = redact(input);                    // throws on un-redactable input
    const response = await anthropic.messages.create({ ... });
    const toolUse = response.content.find((b) => b.type === "tool_use");
    if (!toolUse) throw new AgentRefusalError("no tool_use");
    return { result: OutputSchema.parse(toolUse.input), usage: response.usage };
  },
);
```

`withUsage` writes a `usage_events` row with hashed user id (SHA-256 of `userId || unitId || dayBucket || RALLY_USAGE_HASH_SALT`), unit id, agent name, model, token counts (input, output, cache read, cache creation), latency, and a redaction summary. It logs whether the call succeeded or failed.

## Minimal example

```ts
// agents/activity_suggester/agent.ts
import Anthropic from "@anthropic-ai/sdk";
import { withUsage } from "@/lib/anthropic/withUsage";
import { redact } from "@/lib/redact";
import { MODELS } from "@/lib/anthropic/models";
import { AgentRefusalError } from "@/lib/errors";
import { InputSchema, OutputSchema, type Input, type Output } from "./schema";
import { SYSTEM_PROMPT, buildMessages } from "./prompt";
import { activityTool } from "./tools";

const client = new Anthropic();

export async function runActivitySuggester(input: Input): Promise<Output> {
  const parsed = InputSchema.parse(input);

  return withUsage(
    {
      agent: "activity_suggester",
      unitId: parsed.unitId,
      userId: parsed.userId,
      model: MODELS.sonnet,
    },
    async () => {
      const redacted = redact(parsed);

      const response = await client.messages.create({
        model: MODELS.sonnet,
        max_tokens: 1024,
        system: [
          {
            type: "text",
            text: SYSTEM_PROMPT,
            cache_control: { type: "ephemeral" },
          },
        ],
        tools: [activityTool],
        tool_choice: { type: "tool", name: "emit_activity_suggestions" },
        messages: buildMessages(redacted),
      });

      const toolUse = response.content.find((b) => b.type === "tool_use");
      if (!toolUse || toolUse.type !== "tool_use") {
        throw new AgentRefusalError("activity_suggester returned no tool_use");
      }

      return {
        result: OutputSchema.parse(toolUse.input),
        usage: response.usage,
      };
    },
  );
}
```

## Testing

Each agent ships at least one test under `__tests__/` that loads a recorded Anthropic response fixture and asserts the parsed output. CI runs with `ANTHROPIC_API_KEY` unset; tests must not hit the live API.

---

# Agents

Each agent lives in `agents/<name>/` with this shape:

- `index.ts` — single entrypoint `run<PascalCase>(input)`. Imports `withUsage` from `@/lib/anthropic`. Never imports `@anthropic-ai/sdk` directly.
- `prompt.ts` — exports `buildSystem()` (static portion has `cache_control: 'ephemeral'`) and `buildUserMessage(ctx, ...)`.
- `schema.ts` — Zod schemas for output validation, plus the Anthropic tool definition (`input_schema`).
- `redact.ts` — domain-specific redaction. Composes `lib/redact.ts` primitives. Returns a typed redacted context that is the ONLY thing passed to `prompt.ts`.
- `__tests__/` — at minimum: redaction, schema, integration (mocked).

## Conventions

- Force structured output via `tool_choice: { type: 'tool', name: '...' }`. Never rely on free-form text parsing.
- `withUsage` provides usage logging; pass `caller.unitId` faithfully.
- System prompts have a static portion that is cached; dynamic context goes in the user message.
- Redaction is a hard wall: raw member data is forbidden in prompts. `lib/redact.ts` includes a runtime guard that throws if first name + birthdate appear in the same record.

## Current agents

- **activity_suggester** — suggests 3–7 activities for a unit given recent history and constraints. Tier: `default`.
