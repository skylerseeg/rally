// app/(app)/lessons/new/page.tsx
//
// Save-a-lesson form. Pre-fills from a lesson_planner suggestion when
// ?suggestion_id and ?date are supplied; otherwise renders blank.

import Link from "next/link";

import { Card } from "@/components/ui/Card";
import { getActiveUnit } from "@/lib/auth/units";
import { getCurriculumContext } from "@/lib/lesson-planner";
import { log } from "@/lib/log";
import { createClient } from "@/lib/supabase/server";

import { NewLessonForm, type NewLessonInitial } from "./NewLessonForm";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type SearchParams = {
  suggestion_id?: string;
  date?: string;
};

type Props = {
  searchParams: Promise<SearchParams>;
};

export default async function NewLessonPage({ searchParams }: Props) {
  const params = await searchParams;
  const initial = await buildInitial(params);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/lessons"
          className="text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          &larr; Back to lessons
        </Link>
      </div>
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
        Save lesson
      </h1>
      {initial.source_suggestion_id ? (
        <p className="text-sm text-slate-600">
          Pre-filled from a Claude lesson plan. Edit anything before saving.
        </p>
      ) : null}
      <Card>
        <NewLessonForm initial={initial} />
      </Card>
    </div>
  );
}

async function buildInitial(params: SearchParams): Promise<NewLessonInitial> {
  const taughtOn = params.date && DATE_RE.test(params.date) ? params.date : todayIso();
  const fallback: NewLessonInitial = {
    title: "",
    manual: `come_follow_me_${new Date().getFullYear()}`,
    manual_reference: "",
    taught_on: taughtOn,
    quorum_class: "deacons",
    outline_json: "",
    source_suggestion_id: null,
  };

  const id = params.suggestion_id?.trim();
  if (!id || !UUID_RE.test(id)) return fallback;

  let activeUnitId: string;
  try {
    const active = await getActiveUnit();
    activeUnitId = active.unit.id;
  } catch {
    return fallback;
  }

  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from("agent_suggestions")
    .select("id, unit_id, output")
    .eq("id", id)
    .single();

  if (error || !row || row.unit_id !== activeUnitId) {
    if (error) {
      log.warn({
        event: "lesson_seed_fetch_failed",
        reason: error.message,
      });
    }
    return fallback;
  }

  const stored = row.output as
    | {
        plan?: {
          title?: unknown;
          outline?: unknown;
        };
        manual_reference?: unknown;
        lesson_date?: unknown;
      }
    | null;
  const plan = stored?.plan ?? null;
  const title = plan && typeof plan.title === "string" ? plan.title : "";
  const manualReference =
    typeof stored?.manual_reference === "string"
      ? stored.manual_reference
      : "";
  const lessonDate =
    typeof stored?.lesson_date === "string" && DATE_RE.test(stored.lesson_date)
      ? stored.lesson_date
      : taughtOn;

  // Best-effort: derive `manual` default from the reference. The
  // helper returns the current-year Come, Follow Me default for any
  // reference it can't parse — that's the right v1 default.
  const ctx = getCurriculumContext(manualReference || "");
  const manual = ctx.manual_default;

  return {
    title,
    manual,
    manual_reference: manualReference,
    taught_on: lessonDate,
    quorum_class: "deacons",
    outline_json: plan ? JSON.stringify(plan) : "",
    source_suggestion_id: id,
  };
}

function todayIso(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
