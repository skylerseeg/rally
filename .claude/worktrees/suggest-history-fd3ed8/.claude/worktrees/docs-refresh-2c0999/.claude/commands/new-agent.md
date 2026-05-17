---
description: Scaffold a new Claude agent under agents/<name>/
argument-hint: <agent_name> "<one-line purpose>"
---

# /new-agent

Scaffold a new agent at `agents/$1/` for the Rally codebase.

Inputs:
- `$1` — agent name in `snake_case` (e.g. `activity_suggester`, `lesson_planner`, `member_insights`).
- `$2` — one-line description of what the agent does. If missing, ask.

Steps:

1. Refuse if `agents/$1/` already exists.
2. Create the directory and the following files. Match the contract documented in `agents/README.md` exactly — do not invent a different shape.
   - `agents/$1/agent.ts` — exports `async function run<PascalCaseName>(input: Input): Promise<Output>`. Uses `withUsage()` from `lib/anthropic/withUsage.ts`. Sets `tool_choice: { type: "tool", name: "<tool_name>" }` to force structured output. Defaults to model `claude-sonnet-4-5`.
   - `agents/$1/prompt.ts` — exports `const SYSTEM_PROMPT: string` plus `buildMessages(input)`. The system prompt block must be wrapped with `cache_control: { type: "ephemeral" }` when passed to the SDK.
   - `agents/$1/schema.ts` — Zod `InputSchema` and `OutputSchema`, plus `Input`/`Output` types inferred from them.
   - `agents/$1/tools.ts` — single tool definition whose `input_schema` mirrors `OutputSchema` (use `zodToJsonSchema` or hand-write).
   - `agents/$1/index.ts` — re-export `run<PascalCaseName>` and the types.
3. Before returning anything to the caller, the agent must:
   - Run the input through `redact()` from `lib/redact.ts`.
   - Validate the model's tool-use response with `OutputSchema.parse`.
   - Record token usage via `withUsage()` (input/output/cache tokens, hashed user id, unit id, agent name = `$1`, model).
4. Print the created paths and remind me to:
   - Add the agent name to the union type in `lib/anthropic/withUsage.ts`.
   - Wire it into the relevant server action under `app/`.
   - Add a unit test under `agents/$1/__tests__/`.

Do not generate route or component code. Stop at the agent module.
