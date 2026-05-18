// agents/lesson_planner/redact.ts
//
// Domain-specific redaction for the lesson_planner agent. Lesson
// planning needs much less per-member context than activity_suggester
// — the lesson is for a group, not tailored to individuals — so we
// summarize members down to counts and age distribution only. No
// first names reach the prompt.
//
// Past lesson titles and manual references are NOT redacted — they
// are public curriculum metadata, not PII.

import { redactMembers } from "@/lib/redact";
import type { Member } from "@/lib/redact";

import type { RecentLessonRow } from "@/lib/lesson-planner";

export type LessonPlannerContextInput = {
  unit: {
    quorum_class: string;
  };
  members: Member[];
  recent_lessons: RecentLessonRow[];
  /** Free-text leader-supplied context. Scrubbed of contact info upstream. */
  teacher_context: string | null;
};

export type RedactedLessonContext = {
  audience: {
    quorum_class: string;
    age_band: string;
    member_count: number;
    active_attendance_estimate: number | null;
  };
  recent_lessons: Array<{
    weeks_ago: number;
    manual: string;
    manual_reference: string;
    outline_summary: string | null;
  }>;
  teacher_context: string | null;
};

export type RedactLessonInput = {
  context: LessonPlannerContextInput;
  age_band: string;
};

/**
 * Build a redacted context for the prompt. Composes the base
 * `lib/redact.ts` primitives — `redactMembers` runs the name/DOB
 * hard-fail guard for each member even though we discard the per-
 * member output. That guarantees the input passed in here couldn't
 * smuggle DOB through a hand-rolled call path.
 *
 * The redacted context type is the ONLY thing prompt.ts ever sees.
 */
export function redactForLessonPlanner(
  input: RedactLessonInput,
): RedactedLessonContext {
  // Belt-and-suspenders: run each member through the redactor (which
  // validates name/DOB invariants) even though we only consume counts.
  const redactedMembers = redactMembers(input.context.members, {
    includeNotes: false,
  });

  return {
    audience: {
      quorum_class: input.context.unit.quorum_class,
      age_band: input.age_band,
      member_count: redactedMembers.length,
      // Placeholder for v1 — we'll wire attendance-rate-derived
      // active counts in when the planner takes a roster.
      active_attendance_estimate: null,
    },
    recent_lessons: input.context.recent_lessons.map((l) => ({
      weeks_ago: weeksAgo(l.taught_on),
      manual: l.manual,
      manual_reference: l.manual_reference,
      outline_summary: l.outline_summary,
    })),
    teacher_context: input.context.teacher_context,
  };
}

function weeksAgo(isoDate: string): number {
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return 0;
  return Math.floor((Date.now() - d.getTime()) / (7 * 24 * 60 * 60 * 1000));
}
