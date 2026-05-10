// app/(app)/activities/new/page.tsx

import Link from "next/link";

import { Card } from "@/components/ui/Card";
import { getActiveUnit } from "@/lib/auth/units";
import { log } from "@/lib/log";
import { createClient } from "@/lib/supabase/server";
import {
  ACTIVITY_CATEGORIES,
  type ActivityCategory,
} from "@/lib/validation/activity";
import { createActivity } from "../actions";
import {
  ActivityForm,
  type ActivityFormInitial,
} from "../_components/ActivityForm";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type SearchParams = {
  suggestion_id?: string;
  index?: string;
  date?: string;
};

type Props = {
  searchParams: Promise<SearchParams>;
};

export default async function NewActivityPage({ searchParams }: Props) {
  const params = await searchParams;
  const initial = await loadSuggestionSeed(params);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/activities"
          className="text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          &larr; Back to activities
        </Link>
      </div>
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
        Plan activity
      </h1>
      {initial ? (
        <p className="text-sm text-slate-600">
          Pre-filled from a Claude suggestion. Edit anything before saving.
        </p>
      ) : null}
      <Card>
        <ActivityForm
          action={createActivity}
          cancelHref="/activities"
          submitLabel="Create activity"
          initial={initial ?? undefined}
        />
      </Card>
    </div>
  );
}

type RawSuggestion = {
  title?: unknown;
  description?: unknown;
  category?: unknown;
};

async function loadSuggestionSeed(
  params: SearchParams,
): Promise<ActivityFormInitial | null> {
  const id = params.suggestion_id?.trim();
  const indexStr = params.index?.trim();
  if (!id || !UUID_RE.test(id)) return null;
  if (!indexStr || !/^\d+$/.test(indexStr)) return null;

  let activeUnitId: string;
  try {
    const active = await getActiveUnit();
    activeUnitId = active.unit.id;
  } catch {
    return null;
  }

  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from("agent_suggestions")
    .select("id, unit_id, output")
    .eq("id", id)
    .single();

  if (error || !row || row.unit_id !== activeUnitId) {
    if (error) {
      log.warn({ event: "suggestion_seed_fetch_failed", reason: error.message });
    }
    return null;
  }

  const output = row.output as { suggestions?: RawSuggestion[] } | null;
  const idx = Number(indexStr);
  const picked = output?.suggestions?.[idx];
  if (!picked) return null;

  const category = isActivityCategory(picked.category)
    ? picked.category
    : "social";
  const startsAt = composeStartsAt(params.date);

  return {
    title: typeof picked.title === "string" ? picked.title : "",
    description:
      typeof picked.description === "string" ? picked.description : null,
    starts_at: startsAt,
    ends_at: null,
    location: null,
    category,
    source_suggestion_id: id,
  };
}

function isActivityCategory(v: unknown): v is ActivityCategory {
  return (
    typeof v === "string" &&
    (ACTIVITY_CATEGORIES as readonly string[]).includes(v)
  );
}

function composeStartsAt(date: string | undefined): string {
  // Default 7pm on the picked target_date. ActivityForm runs the value
  // through toDateTimeLocalInput, which accepts ISO-shaped strings.
  const d = date && DATE_RE.test(date) ? date : todayIso();
  return `${d}T19:00:00`;
}

function todayIso(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
