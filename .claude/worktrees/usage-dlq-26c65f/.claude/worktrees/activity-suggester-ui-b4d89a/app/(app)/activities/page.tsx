// app/(app)/activities/page.tsx
//
// Week list. ?week=YYYY-MM-DD pins to that Sunday-anchored week;
// default is the current week.

import Link from "next/link";
import { Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { getActiveUnit } from "@/lib/auth/units";
import {
  endOfWeek,
  formatActivityCategory,
  formatActivityDateRange,
  fromIsoDate,
  isoSunday,
  startOfWeek,
} from "@/lib/format";
import { log } from "@/lib/log";
import { createClient } from "@/lib/supabase/server";
import type { ActivityCategory } from "@/lib/validation/activity";
import { WeekNav } from "./_components/WeekNav";

type Props = {
  searchParams: Promise<{ week?: string }>;
};

const CATEGORY_VARIANT: Record<ActivityCategory, "spiritual" | "service" | "social" | "physical" | "skill"> = {
  spiritual: "spiritual",
  service: "service",
  social: "social",
  physical: "physical",
  skill: "skill",
};

export default async function ActivitiesPage({ searchParams }: Props) {
  const params = await searchParams;
  const weekParam = params.week;
  const baseDate = weekParam ? fromIsoDate(weekParam) : new Date();
  const weekStart = startOfWeek(baseDate);
  const weekEnd = endOfWeek(baseDate);
  const weekIso = isoSunday(baseDate);

  const active = await getActiveUnit();
  const unitId = active.unit.id;
  const supabase = await createClient();

  const { data: activities, error } = await supabase
    .from("activities")
    .select("id, title, starts_at, ends_at, location, category")
    .eq("unit_id", unitId)
    .gte("starts_at", weekStart.toISOString())
    .lt("starts_at", weekEnd.toISOString())
    .order("starts_at", { ascending: true });

  if (error) {
    log.error({ event: "activities_list_failed", reason: error.message });
  }
  const rows = activities ?? [];

  // Attendance summary per activity. n is small; one query then group.
  const ids = rows.map((a) => a.id);
  const summaries = new Map<string, { present: number; total: number }>();
  if (ids.length > 0) {
    const { data: attRows } = await supabase
      .from("attendance")
      .select("activity_id, status")
      .in("activity_id", ids);
    for (const r of attRows ?? []) {
      const cur = summaries.get(r.activity_id) ?? { present: 0, total: 0 };
      cur.total++;
      if (r.status === "present") cur.present++;
      summaries.set(r.activity_id, cur);
    }
  }

  // Next upcoming beyond this week (single teaser).
  const { data: upcoming } = await supabase
    .from("activities")
    .select("id, title, starts_at")
    .eq("unit_id", unitId)
    .gte("starts_at", weekEnd.toISOString())
    .order("starts_at", { ascending: true })
    .limit(1);
  const next = upcoming?.[0];

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Activities
          </h1>
          <p className="text-sm text-slate-600">
            Plan, record attendance, and see what's coming up.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/activities/suggest">
            <Button variant="secondary">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              Suggest with AI
            </Button>
          </Link>
          <Link href="/activities/new">
            <Button>New activity</Button>
          </Link>
        </div>
      </header>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
          This week
        </h2>
        <WeekNav weekStart={weekIso} />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="No activities this week"
          description="Plan one to start tracking attendance."
          action={
            <Link href="/activities/new">
              <Button>Plan an activity</Button>
            </Link>
          }
        />
      ) : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {rows.map((a) => {
            const summary = summaries.get(a.id);
            return (
              <li key={a.id}>
                <Link href={`/activities/${a.id}`} className="block">
                  <Card className="flex h-full flex-col gap-2 transition-shadow hover:shadow-md">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-base font-semibold text-slate-900">
                        {a.title}
                      </h3>
                      <Badge variant={CATEGORY_VARIANT[a.category]}>
                        {formatActivityCategory(a.category)}
                      </Badge>
                    </div>
                    <p className="text-sm text-slate-600">
                      {formatActivityDateRange(a.starts_at, a.ends_at)}
                    </p>
                    {a.location ? (
                      <p className="text-sm text-slate-500">{a.location}</p>
                    ) : null}
                    {summary ? (
                      <p className="text-xs font-medium text-slate-600">
                        {summary.present} / {summary.total} present
                      </p>
                    ) : null}
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {next ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
            Next up
          </h2>
          <Link
            href={`/activities?week=${isoSunday(new Date(next.starts_at))}`}
          >
            <Card className="flex flex-col gap-1 transition-shadow hover:shadow-md">
              <p className="text-base font-semibold text-slate-900">
                {next.title}
              </p>
              <p className="text-sm text-slate-600">
                {formatActivityDateRange(next.starts_at, null)}
              </p>
            </Card>
          </Link>
        </section>
      ) : null}
    </div>
  );
}
