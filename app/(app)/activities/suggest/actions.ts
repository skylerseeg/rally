"use server";

import { createHash } from "node:crypto";

import { redirect } from "next/navigation";
import { z } from "zod";

import {
  runActivitySuggester,
  type RunActivitySuggesterInput,
} from "@/agents/activity_suggester";
import type { Suggestion } from "@/agents/activity_suggester/schema";
import { requireLeader, requireUnitAccess } from "@/lib/auth/guards";
import { getActiveUnit } from "@/lib/auth/units";
import {
  AgentRateLimitError,
  AgentRefusalError,
  AgentSchemaError,
  AuthorizationError,
  NotFoundError,
} from "@/lib/errors";
import { log } from "@/lib/log";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/supabase/types";
import {
  ACTIVITY_CATEGORIES,
  type ActivityCategory,
} from "@/lib/validation/activity";

const generateInputSchema = z.object({
  target_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid target date"),
  category: z
    .union([z.literal("any"), z.enum(ACTIVITY_CATEGORIES)])
    .optional()
    .default("any"),
  constraints: z.string().trim().max(500).optional().or(z.literal("")),
});

export type GenerateInput = z.input<typeof generateInputSchema>;

export type GenerateOk = {
  ok: true;
  suggestion_id: string;
  target_date: string;
  rationale: string;
  suggestions: Suggestion[];
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

const ALL_CATEGORIES: readonly ActivityCategory[] = ACTIVITY_CATEGORIES;

export async function generateSuggestions(
  input: GenerateInput,
): Promise<GenerateResult> {
  const parsed = generateInputSchema.safeParse(input);
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

  const { data: recentRows, error: recentErr } = await supabase
    .from("activities")
    .select("id, title, category, starts_at")
    .eq("unit_id", unitId)
    .order("starts_at", { ascending: false })
    .limit(8);

  if (recentErr) {
    log.error({ event: "suggest_load_recent_failed", reason: recentErr.message });
    return {
      ok: false,
      kind: "unknown",
      message: "Couldn't load recent activities.",
    };
  }

  const recentIds = (recentRows ?? []).map((r) => r.id);
  const attendanceByActivity = new Map<
    string,
    { present: number; absent: number; excused: number }
  >();
  if (recentIds.length > 0) {
    const { data: attRows } = await supabase
      .from("attendance")
      .select("activity_id, status")
      .in("activity_id", recentIds);
    for (const r of attRows ?? []) {
      const cur = attendanceByActivity.get(r.activity_id) ?? {
        present: 0,
        absent: 0,
        excused: 0,
      };
      if (r.status === "present") cur.present++;
      else if (r.status === "absent") cur.absent++;
      else if (r.status === "excused") cur.excused++;
      attendanceByActivity.set(r.activity_id, cur);
    }
  }

  const { data: members, error: membersErr } = await supabase
    .from("members")
    .select("*")
    .eq("unit_id", unitId)
    .eq("is_active", true);

  if (membersErr) {
    log.error({ event: "suggest_load_members_failed", reason: membersErr.message });
    return {
      ok: false,
      kind: "unknown",
      message: "Couldn't load members.",
    };
  }

  // TODO(multi-quorum): pick the dominant quorum_class once we support
  // unit-level multiple groups; for now match createActivity's default.
  const quorumClass = pickDominantQuorum(
    (members ?? []).map((m) => m.quorum_class),
  );

  const constraints: RunActivitySuggesterInput["context"]["constraints"] = {};
  if (parsed.data.constraints && parsed.data.constraints.length > 0) {
    constraints.theme = parsed.data.constraints;
  }
  if (parsed.data.category !== "any") {
    constraints.avoid_kinds = ALL_CATEGORIES.filter(
      (c) => c !== parsed.data.category,
    );
  }

  let runResult;
  try {
    runResult = await runActivitySuggester({
      context: {
        unit: { quorum_class: quorumClass },
        members: members ?? [],
        recent_activities: (recentRows ?? []).map((r) => ({
          title: r.title,
          category: r.category,
          starts_at: r.starts_at,
          attendance_summary: attendanceByActivity.get(r.id) ?? null,
        })),
        constraints,
      },
      caller: { userId, unitId },
    });
  } catch (err) {
    return translateAgentError(err);
  }

  const inputHash = createHash("sha256")
    .update(
      JSON.stringify({
        target_date: parsed.data.target_date,
        category: parsed.data.category,
        constraints: parsed.data.constraints ?? "",
        unit_id: unitId,
        recent_titles: (recentRows ?? []).map((r) => r.title),
      }),
    )
    .digest("hex");

  const { data: inserted, error: insertErr } = await supabase
    .from("agent_suggestions")
    .insert({
      unit_id: unitId,
      agent_name: "activity_suggester",
      input_hash: inputHash,
      output: runResult.output as unknown as Json,
    })
    .select("id")
    .single();

  if (insertErr || !inserted) {
    log.error({
      event: "suggest_insert_failed",
      reason: insertErr?.message,
    });
    return {
      ok: false,
      kind: "unknown",
      message: "Couldn't save suggestions.",
    };
  }

  return {
    ok: true,
    suggestion_id: inserted.id,
    target_date: parsed.data.target_date,
    rationale: runResult.output.rationale,
    suggestions: runResult.output.suggestions,
  };
}

export async function useThisSuggestion(formData: FormData): Promise<void> {
  const suggestionId = String(formData.get("suggestion_id") ?? "");
  const indexRaw = String(formData.get("index") ?? "");
  const targetDate = String(formData.get("target_date") ?? "");

  if (!suggestionId || !/^\d+$/.test(indexRaw)) {
    redirect("/activities/suggest");
  }
  const index = Number(indexRaw);

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
    redirect("/activities/suggest");
  }

  const output = row.output as { suggestions?: Suggestion[] } | null;
  const picked = output?.suggestions?.[index];
  if (!picked) {
    redirect("/activities/suggest");
  }

  const { error: auditErr } = await supabase.from("audit_events").insert({
    unit_id: active.unit.id,
    actor_user_id: user.id,
    action: "activity_suggestion_used",
    target_table: "agent_suggestions",
    target_id: suggestionId,
    metadata: { index, title: picked.title },
  });
  if (auditErr) {
    log.error({ event: "audit_suggestion_used_failed", reason: auditErr.message });
  }

  const params = new URLSearchParams({
    suggestion_id: suggestionId,
    index: String(index),
  });
  if (/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
    params.set("date", targetDate);
  }
  redirect(`/activities/new?${params.toString()}`);
}

function translateAgentError(err: unknown): GenerateErr {
  if (err instanceof AgentRefusalError) {
    return {
      ok: false,
      kind: "refusal",
      message:
        "Claude declined to suggest activities here. This usually means the constraints conflict with safety guidance. Adjust and try again.",
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
        "Something went wrong reading Claude's response. This has been logged. Try again, or simplify your constraints.",
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
          "Something went wrong reading Claude's response. This has been logged. Try again, or simplify your constraints.",
      };
    }
    if (err.message.includes("invalid output shape")) {
      return {
        ok: false,
        kind: "schema",
        message:
          "Something went wrong reading Claude's response. This has been logged. Try again, or simplify your constraints.",
      };
    }
  }
  log.error({
    event: "suggest_unknown_error",
    err,
  });
  return {
    ok: false,
    kind: "unknown",
    message: "Something went wrong. Try again.",
  };
}

const QUORUM_FALLBACK = "deacons" as const;

function pickDominantQuorum(values: string[]): string {
  if (values.length === 0) return QUORUM_FALLBACK;
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best = QUORUM_FALLBACK as string;
  let bestCount = 0;
  for (const [k, c] of counts) {
    if (c > bestCount) {
      best = k;
      bestCount = c;
    }
  }
  return best;
}
