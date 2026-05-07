// app/(app)/activities/[id]/attendance/page.tsx

import Link from "next/link";
import { notFound } from "next/navigation";

import { getActiveUnit } from "@/lib/auth/units";
import { formatActivityDateRange } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { AttendanceMark } from "@/lib/validation/activity";
import { AttendanceCheckIn } from "../../_components/AttendanceCheckIn";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function TakeAttendancePage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const active = await getActiveUnit();
  const unitId = active.unit.id;

  const { data: activity } = await supabase
    .from("activities")
    .select("id, title, starts_at, ends_at, unit_id")
    .eq("id", id)
    .maybeSingle();

  if (!activity || activity.unit_id !== unitId) notFound();

  const { data: members } = await supabase
    .from("members")
    .select("id, first_name, last_name, preferred_name")
    .eq("unit_id", unitId)
    .eq("is_active", true)
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true });

  const { data: existing } = await supabase
    .from("attendance")
    .select("member_id, status, absence_reason_kind, absence_reason_note")
    .eq("activity_id", id);

  const initialMarks: AttendanceMark[] = (existing ?? []).map((r) => ({
    member_id: r.member_id,
    status: r.status,
    absence_reason_kind: r.absence_reason_kind,
    absence_reason_note: r.absence_reason_note,
  }));

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link
          href={`/activities/${id}`}
          className="text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          &larr; Back to activity
        </Link>
      </div>
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Take attendance
        </h1>
        <p className="text-sm text-slate-700">{activity.title}</p>
        <p className="text-sm text-slate-500">
          {formatActivityDateRange(activity.starts_at, activity.ends_at)}
        </p>
      </header>

      <AttendanceCheckIn
        activityId={activity.id}
        members={members ?? []}
        initialMarks={initialMarks}
      />
    </div>
  );
}
