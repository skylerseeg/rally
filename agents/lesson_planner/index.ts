// agents/lesson_planner/index.ts
//
// Entrypoint for the lesson_planner agent. Orchestrates tier
// resolution (with the deep-mode feature flag), redaction, prompt
// construction, the Anthropic call via withUsage, and output
// validation. Never imports @anthropic-ai/sdk directly.
//
// Tier resolution:
//   - input.mode === "deep" AND RALLY_FLAG_LESSON_PLANNER_DEEP === "true" → "deep"
//   - otherwise → "default"
//
// Both conditions are required. The flag enables deep mode for the
// unit; the caller requests it for this lesson. If either is missing
// we fall back silently — the caller's PlanForm shows a tooltip
// explaining why Deep is disabled.

import type Anthropic from "@anthropic-ai/sdk";

import { withUsage } from "@/lib/anthropic";
import type { ModelTier } from "@/lib/anthropic";
import { log } from "@/lib/log";

import { buildSystem, buildUserMessage } from "./prompt";
import { redactForLessonPlanner } from "./redact";
import type { LessonPlannerContextInput } from "./redact";
import {
  emitLessonPlanTool,
  lessonPlanOutputSchema,
  type LessonMode,
  type LessonPlanOutput,
} from "./schema";

export type RunLessonPlannerInput = {
  context: LessonPlannerContextInput;
  caller: { userId: string; unitId: string };
  manual_reference: string;
  lesson_date: string;
  mode: LessonMode;
  /** Pre-computed age band for the audience — derived in the action via getAgeBandForQuorum. */
  age_band: string;
};

export type RunLessonPlannerResult = {
  output: LessonPlanOutput;
  /** The tier actually used — useful for tests + for the action to write into agent_suggestions metadata. */
  tier: ModelTier;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens: number;
    cacheReadTokens: number;
    latencyMs: number;
  };
};

export async function runLessonPlanner(
  input: RunLessonPlannerInput,
): Promise<RunLessonPlannerResult> {
  const tier = resolveTier(input.mode);
  const redacted = redactForLessonPlanner({
    context: input.context,
    age_band: input.age_band,
  });

  const result = await withUsage<unknown>({
    agentName: "lesson_planner",
    tier,
    system: buildSystem(),
    messages: [
      buildUserMessage(redacted, {
        manual_reference: input.manual_reference,
        lesson_date: input.lesson_date,
      }),
    ],
    tools: [emitLessonPlanTool as unknown as Anthropic.Messages.Tool],
    toolChoice: { type: "tool", name: "emit_lesson_plan" },
    // Lesson plans are longer than activity suggestions; bump max
    // tokens. 3072 is comfortable for a 5-section plan with
    // 2-4-sentence teaching_notes per section.
    maxTokens: 3072,
    temperature: 0.7,
    context: { userId: input.caller.userId, unitId: input.caller.unitId },
  });

  if (!result.toolInput) {
    log.error({
      event: "lesson_planner_no_tool_input",
      stop_reason: result.response.stop_reason,
    });
    throw new Error("lesson_planner did not return structured output");
  }

  const parsed = lessonPlanOutputSchema.safeParse(result.toolInput);
  if (!parsed.success) {
    log.error({
      event: "lesson_planner_invalid_output",
      issues: parsed.error.flatten(),
    });
    throw new Error("lesson_planner returned invalid output shape");
  }

  return { output: parsed.data, tier, usage: result.usage };
}

/**
 * Resolve the model tier for this call.
 *
 * Exported for tests so they can assert the gate logic without spinning
 * up the full Anthropic mock. Reads `process.env` at call time so
 * tests can stub the flag with `vi.stubEnv`.
 */
export function resolveTier(mode: LessonMode): ModelTier {
  if (
    mode === "deep" &&
    process.env.RALLY_FLAG_LESSON_PLANNER_DEEP === "true"
  ) {
    return "deep";
  }
  return "default";
}
