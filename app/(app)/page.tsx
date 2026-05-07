// app/(app)/page.tsx
//
// Dashboard. Stat cards + next activity. Real numbers from the user's
// active unit. The wider page styling lives on AppShell.

import Link from "next/link";

import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { getActiveUnit } from "@/lib/auth/units";
import { createClient } from "@/lib/supabase/server";
import {
  formatActivityCategory,
  formatDate,
  formatRelativeTime,
  formatUnitName,
} from "@/lib/format";
import { log } from "@/lib/log";

type StatCardProps = {
  label: string;
  value: number | string;
  href?: string;
  emptyHint?: string;
};

function StatCard({ label, value, href, emptyHint }: StatCardProps) {
  const isEmpty = value === 0 || value === "—";
  const display = isEmpty && emptyHint ? emptyHint : value;

  const inner = (
    <Card className="flex flex-col gap-2">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-600">
        {label}
      </div>
      <div
        className={
          isEmpty && emptyHint
            ? "text-sm text-slate-500"
            : "text-3xl font-semibold tracking-tight text-slate-900"
        }
      >
        {display}
      </div>
      {href ? (
        <div className="text-xs font-medium text-slate-600">
          <span className="underline-offset-2 group-hover:underline">View &rarr;</span>
        </div>
      ) : null}
    </Card>
  );

  if (href) {
    return (
      <Link href={href} className="group block">
        {inner}
      </Link>
    );
  }
  return inner;
}

export default async function DashboardPage() {
  const active = await getActiveUnit();
  const supabase = await createClient();
  const unitId = active.unit.id;
  const now = new Date();

  // Active members count.
  const { count: membersCount, error: membersError } = await supabase
    .from("members")
    .select("*", { count: "exact", head: true })
    .eq("unit_id", unitId)
    .eq("is_active", true);
  if (membersError) {
    log.warn({
      event: "dashboard_members_count_failed",
      reason: membersError.message,
    });
  }

  // Upcoming activities (anything in the future).
  const { count: upcomingCount, error: upcomingError } = await supabase
    .from("activities")
    .select("*", { count: "exact", head: true })
    .eq("unit_id", unitId)
    .gte("starts_at", now.toISOString());
  if (upcomingError) {
    log.warn({
      event: "dashboard_upcoming_count_failed",
      reason: upcomingError.message,
    });
  }

  // Last attendance: most recent recorded_at across all activities for
  // this unit. The link drops the leader straight into that activity.
  const { data: lastAttendanceRows } = await supabase
    .from("attendance")
    .select("activity_id, recorded_at")
    .eq("unit_id", unitId)
    .order("recorded_at", { ascending: false })
    .limit(1);
  const lastAttendance = lastAttendanceRows?.[0];

  // Next upcoming activity (for the panel below).
  const { data: nextActivityRows } = await supabase
    .from("activities")
    .select("id, title, starts_at, location, category")
    .eq("unit_id", unitId)
    .gte("starts_at", now.toISOString())
    .order("starts_at", { ascending: true })
    .limit(1);
  const nextActivity = nextActivityRows?.[0];

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Dashboard
        </h1>
        <p className="text-sm text-slate-600">{formatUnitName(active.unit)}</p>
      </header>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Active members"
          value={membersCount ?? 0}
          href="/members"
          emptyHint="No members yet."
        />
        <StatCard
          label="Upcoming activities"
          value={upcomingCount ?? 0}
          href="/activities"
          emptyHint="No activities scheduled."
        />
        <StatCard
          label="Last attendance"
          value={
            lastAttendance ? formatRelativeTime(lastAttendance.recorded_at) : "—"
          }
          href={
            lastAttendance ? `/activities/${lastAttendance.activity_id}` : undefined
          }
          emptyHint="No attendance recorded yet."
        />
        <StatCard
          label="Open action items"
          value="—"
          href="/presidency/action-items"
          emptyHint="Action items table not yet implemented."
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
          Next activity
        </h2>
        {nextActivity ? (
          <Link
            href={`/activities/${nextActivity.id}`}
            className="block"
          >
            <Card className="flex flex-col gap-2 transition-shadow hover:shadow-md">
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-base font-semibold text-slate-900">
                  {nextActivity.title}
                </h3>
                <span className="text-xs font-medium text-slate-500">
                  {formatActivityCategory(nextActivity.category)}
                </span>
              </div>
              <p className="text-sm text-slate-600">
                {formatDate(nextActivity.starts_at, "long")} ·{" "}
                {formatDate(nextActivity.starts_at, "time")}
              </p>
              {nextActivity.location ? (
                <p className="text-sm text-slate-500">{nextActivity.location}</p>
              ) : null}
            </Card>
          </Link>
        ) : (
          <EmptyState
            title="No upcoming activities"
            description="Plan one when you're ready — they'll show up here."
            action={
              <Link href="/activities/new" className="text-sm font-medium text-slate-700 underline">
                Plan an activity
              </Link>
            }
          />
        )}
      </section>
    </div>
  );
}
