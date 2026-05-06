// app/(app)/page.tsx
//
// Dashboard. Stat cards + next activity. Real numbers from the user's
// active unit. The wider page styling lives on AppShell.

import Link from "next/link";

import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { getActiveUnit } from "@/lib/auth/units";
import { createClient } from "@/lib/supabase/server";
import { formatActivityCategory, formatDate, formatUnitName } from "@/lib/format";
import { log } from "@/lib/log";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

type StatCardProps = {
  label: string;
  value: number | string;
  href?: string;
  emptyHint?: string;
};

function StatCard({ label, value, href, emptyHint }: StatCardProps) {
  const isZero = value === 0 || value === "—";
  const display = isZero && emptyHint ? emptyHint : value;

  const inner = (
    <Card className="flex flex-col gap-2">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-600">
        {label}
      </div>
      <div
        className={
          isZero && emptyHint
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
  const thirtyDaysOut = new Date(now.getTime() + THIRTY_DAYS_MS);

  // Active members count.
  const { count: membersCount, error: membersError } = await supabase
    .from("members")
    .select("*", { count: "exact", head: true })
    .eq("unit_id", unitId)
    .eq("is_active", true);
  if (membersError) {
    log.warn({ event: "dashboard_members_count_failed", reason: membersError.message });
  }

  // Upcoming activities (next 30 days).
  const { count: upcomingCount, error: upcomingError } = await supabase
    .from("activities")
    .select("*", { count: "exact", head: true })
    .eq("unit_id", unitId)
    .gte("starts_at", now.toISOString())
    .lt("starts_at", thirtyDaysOut.toISOString());
  if (upcomingError) {
    log.warn({ event: "dashboard_upcoming_count_failed", reason: upcomingError.message });
  }

  // Most recent past activity (for attendance metric).
  const { data: lastActivityRows, error: lastActivityError } = await supabase
    .from("activities")
    .select("id, title, starts_at")
    .eq("unit_id", unitId)
    .lt("starts_at", now.toISOString())
    .order("starts_at", { ascending: false })
    .limit(1);
  if (lastActivityError) {
    log.warn({ event: "dashboard_last_activity_failed", reason: lastActivityError.message });
  }
  const lastActivity = lastActivityRows?.[0];

  let attendanceLabel: string = "—";
  let attendanceHint: string | undefined = "No past activities yet.";
  if (lastActivity && membersCount && membersCount > 0) {
    const { count: presentCount } = await supabase
      .from("attendance")
      .select("*", { count: "exact", head: true })
      .eq("activity_id", lastActivity.id)
      .eq("status", "present");
    if (presentCount !== null && presentCount !== undefined) {
      const pct = Math.round((presentCount / membersCount) * 100);
      attendanceLabel = `${pct}%`;
      attendanceHint = undefined;
    }
  }

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
        <p className="text-sm text-slate-600">
          {formatUnitName(active.unit)}
        </p>
      </header>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Active members"
          value={membersCount ?? 0}
          href="/members"
          emptyHint="No members yet."
        />
        <StatCard
          label="Upcoming · next 30 days"
          value={upcomingCount ?? 0}
          href="/activities"
          emptyHint="No activities scheduled."
        />
        <StatCard
          label="Last activity attendance"
          value={attendanceLabel}
          href="/activities"
          emptyHint={attendanceHint}
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
          <Card className="flex flex-col gap-2">
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
        ) : (
          <EmptyState
            title="No upcoming activities"
            description="Plan one when you're ready — they'll show up here."
          />
        )}
      </section>
    </div>
  );
}
