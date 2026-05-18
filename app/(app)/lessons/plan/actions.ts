"use server";

import { createHash } from "node:crypto";

import { redirect } from "next/navigation";

import { runLessonPlanner } from "@/agents/lesson_planner";
import {
  planInputSchema,
  type LessonPlanOutput,
  type PlanInput,
} from "@/agents/lesson_planner/schema";
import { requireLeader, requireUnitAccess } from "@/lib/auth/guards";
import { getActiveUnit } from "@/lib/auth/units";
import type { ModelTier } from "@/lib/anthropic";
import {
  AgentRateLimitError,
  AgentRefusalError,
  AgentSchemaError,
  AuthorizationError,
  NotFoundError,
} from "@/lib/errors";
import {
  getAgeBandForQuorum,
  getRecentLessons,
  type QuorumClass,
} from "@/lib/lesson-planner";
import { log } from "@/lib/log";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/supabase/types";

export type GenerateOk = {
  ok: true;
  suggestion_id: string;
  lesson_date: string;
  manual_reference: string;
  tier: ModelTier;
  plan: LessonPlanOutput;
};

export type GenerateErrKind =
  | "validation"
  | "unauthorized"
  | "refusal"
  | "schema"
  | "rate_limit"
  | "unknown";

export type GenerateErr = {
  ok: false;
  kind: GenerateErrKind;
  message: string;
};

export type GenerateResult = GenerateOk | GenerateErr;

export async function generatePlan(
  input: PlanInput,
): Promise<GenerateResult> {
  const parsed = planInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      kind: "validation",
      message: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  let userId: string;
  let unitId: string;
  try {
    const { user } = await requireLeader();
    const active = await getActiveUnit();
    await requireUnitAccess(active.unit.id);
    userId = user.id;
    unitId = active.unit.id;
  } catch (err) {
    if (err instanceof AuthorizationError || err instanceof NotFoundError) {
      return {
        ok: false,
        kind: "unauthorized",
        message: "You don't have access to a unit yet.",
      };
    }
    throw err;
  }

  const supabase = await createClient();

  const { data: members, error: membersErr } = await supabase
    .from("members")
    .select("*")
    .eq("unit_id", unitId)
    .eq("is_active", true);

  if (membersErr) {
    log.error({
      event: "plan_load_members_failed",
      reason: membersErr.message,
    });
    return {
      ok: false,
      kind: "unknown",
      message: "Couldn't load members.",
    };
  }

  let recentLessons: Awaited<ReturnType<typeof getRecentLessons>> = [];
  try {
    recentLessons = await getRecentLessons(supabase, unitId, 8);
  } catch (err) {
    log.error({
      event: "plan_load_recent_lessons_failed",
      err: err instanceof Error ? err.message : String(err),
    });
    // Recent lessons are nice-to-have; proceed without them.
  }

  // TODO(multi-quorum): pick dominant quorum from members; for now match
  // the activity-suggester convention and default to deacons when the
  // member roster is empty.
  const dominantQuorum = pickDominantQuorum(
    (members ?? []).map((m) => m.quorum_class as QuorumClass),
  );
  const ageBand = getAgeBandForQuorum(dominantQuorum);

  let runResult;
  try {
    runResult = await runLessonPlanner({
      context: {
        unit: { quorum_class: dominantQuorum },
        members: members ?? [],
        recent_lessons: recentLessons,
        teacher_context: parsed.data.teacher_context || null,
      },
      caller: { userId, unitId },
      manual_reference: parsed.data.manual_reference,
      lesson_date: parsed.data.lesson_date,
      mode: parsed.data.mode,
      age_band: ageBand,
    });
  } catch (err) {
    return translateAgentError(err);
  }

  const inputHash = createHash("sha256")
    .update(
      JSON.stringify({
        manual_reference: parsed.data.manual_reference,
        lesson_date: parsed.data.lesson_date,
        mode: parsed.data.mode,
        teacher_context: parsed.data.teacher_context ?? "",
        unit_id: unitId,
      }),
    )
    .digest("hex");

  // Bundle the plan with the leader's lesson_date so /lessons/new can
  // pre-fill it without a second query param. Mode + tier go in too so
  // the suggestion-history view can show how it was generated.
  const storedOutput = {
    plan: runResult.output,
    lesson_date: parsed.data.lesson_date,
    manual_reference: parsed.data.manual_reference,
    mode: parsed.data.mode,
    tier: runResult.tier,
  };

  const { data: inserted, error: insertErr } = await supabase
    .from("agent_suggestions")
    .insert({
      unit_id: unitId,
      agent_name: "lesson_planner",
      input_hash: inputHash,
      output: storedOutput as unknown as Json,
    })
    .select("id")
    .single();

  if (insertErr || !inserted) {
    log.error({
      event: "plan_insert_failed",
      reason: insertErr?.message,
    });
    return {
      ok: false,
      kind: "unknown",
      message: "Couldn't save the plan.",
    };
  }

  return {
    ok: true,
    suggestion_id: inserted.id,
    lesson_date: parsed.data.lesson_date,
    manual_reference: parsed.data.manual_reference,
    tier: runResult.tier,
    plan: runResult.output,
  };
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function useThisPlan(formData: FormData): Promise<void> {
  const suggestionId = String(formData.get("suggestion_id") ?? "");
  const lessonDate = String(formData.get("lesson_date") ?? "");

  if (!UUID_RE.test(suggestionId)) {
    redirect("/lessons/plan");
  }

  const { user } = await requireLeader();
  const active = await getActiveUnit();
  await requireUnitAccess(active.unit.id);

  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from("agent_suggestions")
    .select("id, unit_id, output")
    .eq("id", suggestionId)
    .single();

  if (error || !row || row.unit_id !== active.unit.id) {
    redirect("/lessons/plan");
  }

  const stored = row.output as
    | { plan?: { title?: unknown }; manual_reference?: unknown }
    | null;
  const title =
    stored?.plan && typeof stored.plan.title === "string"
      ? stored.plan.title
      : null;
  const manualReference =
    typeof stored?.manual_reference === "string"
      ? stored.manual_reference
      : null;

  const { error: auditErr } = await supabase.from("audit_events").insert({
    unit_id: active.unit.id,
    actor_user_id: user.id,
    action: "lesson_plan_used",
    target_table: "agent_suggestions",
    target_id: suggestionId,
    metadata: {
      title,
      manual_reference: manualReference,
    },
  });
  if (auditErr) {
    log.error({
      event: "audit_lesson_plan_used_failed",
      reason: auditErr.message,
    });
  }

  const params = new URLSearchParams({ suggestion_id: suggestionId });
  if (DATE_RE.test(lessonDate)) {
    params.set("date", lessonDate);
  }
  redirect(`/lessons/new?${params.toString()}`);
}

function translateAgentError(err: unknown): GenerateErr {
  if (err instanceof AgentRefusalError) {
    return {
      ok: false,
      kind: "refusal",
      message:
        "Claude declined to plan this lesson. The reference may need to be more specific, or the constraints may conflict with safety guidance. Adjust and try again.",
    };
  }
  if (err instanceof AgentRateLimitError) {
    return {
      ok: false,
      kind: "rate_limit",
      message: "We've hit Claude's rate limit. Wait a minute and retry.",
    };
  }
  if (err instanceof AgentSchemaError) {
    return {
      ok: false,
      kind: "schema",
      message:
        "Something went wrong reading Claude's response. This has been logged. Try again.",
    };
  }
  if (typeof err === "object" && err !== null && "status" in err) {
    const status = (err as { status?: number }).status;
    if (status === 429) {
      return {
        ok: false,
        kind: "rate_limit",
        message: "We've hit Claude's rate limit. Wait a minute and retry.",
      };
    }
  }
  if (err instanceof Error) {
    if (err.message.includes("did not return structured output")) {
      return {
        ok: false,
        kind: "schema",
        message:
          "Something went wrong reading Claude's response. This has been logged. Try again.",
      };
    }
    if (err.message.includes("invalid output shape")) {
      return {
        ok: false,
        kind: "schema",
        message:
          "Something went wrong reading Claude's response. This has been logged. Try again.",
      };
    }
  }
  log.error({ event: "plan_unknown_error", err });
  return {
    ok: false,
    kind: "unknown",
    message: "Something went wrong. Try again.",
  };
}

const QUORUM_FALLBACK: QuorumClass = "deacons";

function pickDominantQuorum(values: QuorumClass[]): QuorumClass {
  if (values.length === 0) return QUORUM_FALLBACK;
  const counts = new Map<QuorumClass, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: QuorumClass = QUORUM_FALLBACK;
  let bestCount = 0;
  for (const [k, c] of counts) {
    if (c > bestCount) {
      best = k;
      bestCount = c;
    }
  }
  return best;
}
