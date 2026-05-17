// app/(app)/activities/suggest/history/page.tsx
//
// Read-only history of every activity_suggester batch generated for the
// active unit. Lets leaders revisit what Claude suggested last week
// without having to dig through usage_events.
//
// Per-batch "Used N / Y" is derived from activities.source_suggestion_id
// (set when a leader clicks "Use this" and then saves the resulting
// activity) — not from audit_events. So the count reflects activities
// that actually exist, not bare clicks-with-no-save.

import Link from "next/link";

import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { getActiveUnit } from "@/lib/auth/units";
import { formatActivityCategory, formatRelativeTime } from "@/lib/format";
import { log } from "@/lib/log";
import { createClient } from "@/lib/supabase/server";
import type {
  ActivityCategory,
} from "@/lib/validation/activity";

const PAGE_LIMIT = 20;

type RawSuggestion = {
  title?: unknown;
  category?: unknown;
  description?: unknown;
  duration_minutes?: unknown;
  estimated_cost_usd?: unknown;
  prep_checklist?: unknown;
  supply_list?: unknown;
  faith_framing?: unknown;
};

type RawOutput = {
  suggestions?: RawSuggestion[];
  rationale?: unknown;
};

const CATEGORY_VARIANT: Record<ActivityCategory, BadgeVariant> = {
  spiritual: "spiritual",
  service: "service",
  social: "social",
  physical: "physical",
  skill: "skill",
};

const ACTIVITY_CATEGORY_SET: ReadonlySet<ActivityCategory> = new Set([
  "spiritual",
  "service",
  "social",
  "physical",
  "skill",
]);

export default async function SuggestHistoryPage() {
  const active = await getActiveUnit();
  const unitId = active.unit.id;
  const supabase = await createClient();

  const { data: rows, error } = await supabase
    .from("agent_suggestions")
    .select("id, output, created_at")
    .eq("unit_id", unitId)
    .eq("agent_name", "activity_suggester")
    .order("created_at", { ascending: false })
    .limit(PAGE_LIMIT);

  if (error) {
    log.error({
      event: "suggest_history_load_failed",
      reason: error.message,
    });
  }

  const batches = rows ?? [];
  const usedBySuggestion = await loadUsedCounts(
    supabase,
    batches.map((b) => b.id),
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <Link
          href="/activities/suggest"
          className="text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          &larr; Back to suggest
        </Link>
        <Link
          href="/activities/suggest"
          className="text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          Generate new &rarr;
        </Link>
      </div>

      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Suggestion history
        </h1>
        <p className="text-sm text-slate-600">
          The last {PAGE_LIMIT} batches Claude generated for this unit, newest
          first. &ldquo;Used&rdquo; counts activities created from a
          suggestion in that batch.
        </p>
      </div>

      {batches.length === 0 ? (
        <EmptyState
          title="No suggestions yet"
          description="Generate your first batch to start building a history."
          action={
            <Link
              href="/activities/suggest"
              className="text-sm font-medium text-slate-900 underline"
            >
              Suggest an activity
            </Link>
          }
        />
      ) : (
        <ul className="flex flex-col gap-4">
          {batches.map((b) => {
            const output = (b.output ?? {}) as RawOutput;
            const suggestions = Array.isArray(output.suggestions)
              ? output.suggestions
              : [];
            const used = usedBySuggestion.get(b.id) ?? 0;
            return (
              <li key={b.id}>
                <BatchCard
                  createdAt={b.created_at}
                  rationale={
                    typeof output.rationale === "string"
                      ? output.rationale
                      : null
                  }
                  suggestions={suggestions}
                  used={used}
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function BatchCard({
  createdAt,
  rationale,
  suggestions,
  used,
}: {
  createdAt: string;
  rationale: string | null;
  suggestions: RawSuggestion[];
  used: number;
}) {
  const total = suggestions.length;
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <p className="text-sm font-medium text-slate-900">
            {formatRelativeTime(createdAt)}
          </p>
          <p className="text-xs text-slate-500">
            {new Date(createdAt).toLocaleString()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="neutral">
            {used} / {total} used
          </Badge>
        </div>
      </div>

      {rationale ? (
        <p className="text-sm italic text-slate-600">{rationale}</p>
      ) : null}

      <details className="group">
        <summary className="cursor-pointer list-none text-sm font-medium text-slate-700 hover:text-slate-900">
          <span className="group-open:hidden">Show {total} suggestions ▾</span>
          <span className="hidden group-open:inline">Hide suggestions ▴</span>
        </summary>
        <ul className="mt-3 flex flex-col gap-3">
          {suggestions.map((s, i) => (
            <li key={i}>
              <SuggestionRow suggestion={s} />
            </li>
          ))}
        </ul>
      </details>
    </Card>
  );
}

function SuggestionRow({ suggestion }: { suggestion: RawSuggestion }) {
  const title = typeof suggestion.title === "string" ? suggestion.title : "(untitled)";
  const description =
    typeof suggestion.description === "string"
      ? suggestion.description
      : null;
  const category = isActivityCategory(suggestion.category)
    ? suggestion.category
    : null;
  const duration =
    typeof suggestion.duration_minutes === "number"
      ? suggestion.duration_minutes
      : null;
  const cost =
    typeof suggestion.estimated_cost_usd === "number"
      ? suggestion.estimated_cost_usd
      : null;

  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        {category ? (
          <Badge variant={CATEGORY_VARIANT[category]}>
            {formatActivityCategory(category)}
          </Badge>
        ) : null}
      </div>
      {description ? (
        <p className="mt-1 text-sm text-slate-700">{description}</p>
      ) : null}
      {duration !== null || cost !== null ? (
        <p className="mt-1 text-xs text-slate-500">
          {duration !== null ? `~${duration} min` : null}
          {duration !== null && cost !== null ? " · " : null}
          {cost !== null ? `~$${cost}` : null}
        </p>
      ) : null}
    </div>
  );
}

function isActivityCategory(v: unknown): v is ActivityCategory {
  return typeof v === "string" && ACTIVITY_CATEGORY_SET.has(v as ActivityCategory);
}

async function loadUsedCounts(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- reason: SupabaseClient typing here gets noisy; the only call site is local
  supabase: any,
  suggestionIds: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (suggestionIds.length === 0) return counts;

  const { data, error } = await supabase
    .from("activities")
    .select("source_suggestion_id")
    .in("source_suggestion_id", suggestionIds);

  if (error) {
    log.error({
      event: "suggest_history_used_count_failed",
      reason: error.message,
    });
    return counts;
  }

  for (const row of (data ?? []) as Array<{ source_suggestion_id: string | null }>) {
    if (!row.source_suggestion_id) continue;
    counts.set(
      row.source_suggestion_id,
      (counts.get(row.source_suggestion_id) ?? 0) + 1,
    );
  }
  return counts;
}
