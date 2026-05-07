// app/(app)/activities/[id]/page.tsx

import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  formatActivityCategory,
  formatActivityDateRange,
  formatMemberFullName,
} from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import {
  ABSENCE_REASON_LABELS,
  type AbsenceReasonKind,
  type ActivityCategory,
  type AttendanceStatus,
} from "@/lib/validation/activity";
import { DeleteActivityForm } from "./DeleteActivityForm";

type Props = {
  params: Promise<{ id: string }>;
};

const CATEGORY_VARIANT: Record<ActivityCategory, "spiritual" | "service" | "social" | "physical" | "skill"> = {
  spiritual: "spiritual",
  service: "service",
  social: "social",
  physical: "physical",
  skill: "skill",
};

type AttendanceRow = {
  member_id: string;
  status: AttendanceStatus;
  absence_reason_kind: AbsenceReasonKind | null;
  absence_reason_note: string | null;
};

type RosterMember = {
  id: string;
  first_name: string;
  last_name: string;
  preferred_name: string | null;
};

export default async function ActivityDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: activity } = await supabase
    .from("activities")
    .select(
      "id, unit_id, title, description, starts_at, ends_at, location, category",
    )
    .eq("id", id)
    .maybeSingle();

  if (!activity) notFound();

  const { data: attendanceRows } = await supabase
    .from("attendance")
    .select("member_id, status, absence_reason_kind, absence_reason_note")
    .eq("activity_id", id);
  const attendance = (attendanceRows ?? []) as AttendanceRow[];

  // Pull member details for any member that has an attendance row.
  const memberIds = attendance.map((a) => a.member_id);
  const membersById = new Map<string, RosterMember>();
  if (memberIds.length > 0) {
    const { data: memberRows } = await supabase
      .from("members")
      .select("id, first_name, last_name, preferred_name")
      .in("id", memberIds);
    for (const m of memberRows ?? []) {
      membersById.set(m.id, m);
    }
  }

  const present = attendance.filter((a) => a.status === "present");
  const absent = attendance.filter((a) => a.status === "absent");
  const excused = attendance.filter((a) => a.status === "excused");

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

      <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              {activity.title}
            </h1>
            <Badge variant={CATEGORY_VARIANT[activity.category]}>
              {formatActivityCategory(activity.category)}
            </Badge>
          </div>
          <p className="text-sm text-slate-600">
            {formatActivityDateRange(activity.starts_at, activity.ends_at)}
          </p>
          {activity.location ? (
            <p className="text-sm text-slate-500">{activity.location}</p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/activities/${activity.id}/attendance`}>
            <Button>Take attendance</Button>
          </Link>
          <Link href={`/activities/${activity.id}/edit`}>
            <Button variant="secondary">Edit</Button>
          </Link>
          <DeleteActivityForm activityId={activity.id} title={activity.title} />
        </div>
      </header>

      {activity.description ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
            Description
          </h2>
          <Card>
            <p className="whitespace-pre-wrap text-sm text-slate-800">
              {activity.description}
            </p>
          </Card>
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
            Attendance
          </h2>
          {attendance.length > 0 ? (
            <p className="text-xs text-slate-500">
              {present.length} present · {absent.length} absent ·{" "}
              {excused.length} excused
            </p>
          ) : null}
        </div>
        {attendance.length === 0 ? (
          <EmptyState
            title="No attendance recorded"
            description="Take attendance to log who was here."
            action={
              <Link href={`/activities/${activity.id}/attendance`}>
                <Button>Take attendance</Button>
              </Link>
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <RosterCard
              title="Present"
              tone="emerald"
              rows={present}
              members={membersById}
            />
            <RosterCard
              title="Absent"
              tone="red"
              rows={absent}
              members={membersById}
              showReason
            />
            <RosterCard
              title="Excused"
              tone="amber"
              rows={excused}
              members={membersById}
            />
          </div>
        )}
      </section>
    </div>
  );
}

function RosterCard({
  title,
  tone,
  rows,
  members,
  showReason = false,
}: {
  title: string;
  tone: "emerald" | "red" | "amber";
  rows: AttendanceRow[];
  members: Map<string, RosterMember>;
  showReason?: boolean;
}) {
  const toneClass =
    tone === "emerald"
      ? "text-emerald-700"
      : tone === "red"
      ? "text-red-700"
      : "text-amber-700";

  return (
    <Card className="flex flex-col gap-3">
      <p className={`text-xs font-semibold uppercase tracking-wide ${toneClass}`}>
        {title} · {rows.length}
      </p>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">—</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((r) => {
            const m = members.get(r.member_id);
            return (
              <li key={r.member_id} className="text-sm text-slate-800">
                <p className="font-medium">
                  {m
                    ? formatMemberFullName(m)
                    : "Unknown member"}
                </p>
                {showReason &&
                (r.absence_reason_kind || r.absence_reason_note) ? (
                  <p className="text-xs text-slate-500">
                    {r.absence_reason_kind
                      ? ABSENCE_REASON_LABELS[r.absence_reason_kind]
                      : null}
                    {r.absence_reason_kind && r.absence_reason_note
                      ? " · "
                      : null}
                    {r.absence_reason_note}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
