"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { formatMemberFullName } from "@/lib/format";
import {
  ABSENCE_REASON_KINDS,
  ABSENCE_REASON_LABELS,
  type AbsenceReasonKind,
  type AttendanceMark,
  type AttendanceStatus,
} from "@/lib/validation/activity";
import { recordAttendance } from "../[id]/attendance/actions";

type RosterMember = {
  id: string;
  first_name: string;
  last_name: string;
  preferred_name: string | null;
};

type Props = {
  activityId: string;
  members: RosterMember[];
  initialMarks: AttendanceMark[];
};

type LocalMark = {
  status: AttendanceStatus;
  reasonKind: AbsenceReasonKind | null;
  reasonNote: string;
};

function defaultMark(): LocalMark {
  return { status: "present", reasonKind: null, reasonNote: "" };
}

function buildInitialMap(
  members: RosterMember[],
  initialMarks: AttendanceMark[],
): Map<string, LocalMark> {
  const map = new Map<string, LocalMark>();
  for (const m of members) map.set(m.id, defaultMark());
  for (const mark of initialMarks) {
    map.set(mark.member_id, {
      status: mark.status,
      reasonKind: mark.absence_reason_kind ?? null,
      reasonNote: mark.absence_reason_note ?? "",
    });
  }
  return map;
}

const STATUS_LABEL: Record<AttendanceStatus, string> = {
  present: "Present",
  absent: "Absent",
  excused: "Excused",
  unknown: "Unknown",
};

// UI exposes 3 statuses; 'unknown' is a DB-level default and isn't surfaced.
const STATUS_OPTIONS: AttendanceStatus[] = ["present", "absent", "excused"];

export function AttendanceCheckIn({
  activityId,
  members,
  initialMarks,
}: Props) {
  const router = useRouter();
  const [marks, setMarks] = useState<Map<string, LocalMark>>(
    buildInitialMap(members, initialMarks),
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const counts = useMemo(() => {
    let present = 0;
    let absent = 0;
    let excused = 0;
    for (const m of marks.values()) {
      if (m.status === "present") present++;
      else if (m.status === "absent") absent++;
      else if (m.status === "excused") excused++;
    }
    return { present, absent, excused };
  }, [marks]);

  function setStatus(memberId: string, status: AttendanceStatus) {
    setMarks((prev) => {
      const next = new Map(prev);
      const cur = next.get(memberId) ?? defaultMark();
      // Clear reason when leaving the absent path; the schema check
      // allows reasons on excused/unknown too but the UX collects them
      // only for absent.
      if (status !== "absent") {
        next.set(memberId, {
          status,
          reasonKind: null,
          reasonNote: "",
        });
      } else {
        next.set(memberId, { ...cur, status });
      }
      return next;
    });
  }

  function toggleReason(memberId: string, kind: AbsenceReasonKind) {
    setMarks((prev) => {
      const next = new Map(prev);
      const cur = next.get(memberId) ?? defaultMark();
      next.set(memberId, {
        ...cur,
        reasonKind: cur.reasonKind === kind ? null : kind,
      });
      return next;
    });
  }

  function setReasonNote(memberId: string, note: string) {
    setMarks((prev) => {
      const next = new Map(prev);
      const cur = next.get(memberId) ?? defaultMark();
      next.set(memberId, { ...cur, reasonNote: note });
      return next;
    });
  }

  function onSave() {
    setError(null);
    const payload = {
      activity_id: activityId,
      marks: members.map((m): AttendanceMark => {
        const local = marks.get(m.id) ?? defaultMark();
        const isAbsent = local.status === "absent";
        return {
          member_id: m.id,
          status: local.status,
          absence_reason_kind: isAbsent ? local.reasonKind : null,
          absence_reason_note:
            isAbsent && local.reasonNote.trim().length > 0
              ? local.reasonNote.trim()
              : null,
        };
      }),
    };

    startTransition(async () => {
      const result = await recordAttendance(payload);
      if (!result.ok) {
        setError(result.error ?? "Could not save attendance.");
        return;
      }
      router.push(`/activities/${activityId}`);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4 pb-24">
      <div className="sticky top-14 z-30 -mx-4 border-b border-slate-200 bg-slate-50/95 px-4 py-2 backdrop-blur">
        <p className="text-sm font-medium text-slate-700">
          <span className="text-emerald-700">{counts.present} present</span>
          <span className="text-slate-400"> · </span>
          <span className="text-red-700">{counts.absent} absent</span>
          <span className="text-slate-400"> · </span>
          <span className="text-amber-700">{counts.excused} excused</span>
        </p>
      </div>

      <ul className="flex flex-col gap-2">
        {members.map((m) => {
          const local = marks.get(m.id) ?? defaultMark();
          return (
            <li
              key={m.id}
              className="rounded-md border border-slate-200 bg-white p-3"
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <p className="text-base font-semibold text-slate-900">
                  {formatMemberFullName(m)}
                </p>
                <div
                  role="radiogroup"
                  aria-label={`Attendance for ${formatMemberFullName(m)}`}
                  className="inline-flex overflow-hidden rounded-md border border-slate-300"
                >
                  {STATUS_OPTIONS.map((s) => {
                    const active = local.status === s;
                    return (
                      <button
                        key={s}
                        role="radio"
                        aria-checked={active}
                        type="button"
                        onClick={() => setStatus(m.id, s)}
                        className={cn(
                          "px-4 py-2 text-sm font-medium transition-colors",
                          active
                            ? s === "present"
                              ? "bg-emerald-600 text-white"
                              : s === "absent"
                              ? "bg-red-600 text-white"
                              : "bg-amber-500 text-white"
                            : "bg-white text-slate-700 hover:bg-slate-50",
                        )}
                      >
                        {STATUS_LABEL[s]}
                      </button>
                    );
                  })}
                </div>
              </div>

              {local.status === "absent" ? (
                <div className="mt-3 flex flex-col gap-2 border-t border-slate-100 pt-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Reason
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {ABSENCE_REASON_KINDS.map((k) => {
                      const active = local.reasonKind === k;
                      return (
                        <button
                          key={k}
                          type="button"
                          onClick={() => toggleReason(m.id, k)}
                          className={cn(
                            "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                            active
                              ? "bg-slate-900 text-white"
                              : "bg-slate-100 text-slate-700 hover:bg-slate-200",
                          )}
                        >
                          {ABSENCE_REASON_LABELS[k]}
                        </button>
                      );
                    })}
                  </div>
                  <textarea
                    value={local.reasonNote}
                    onChange={(e) => setReasonNote(m.id, e.target.value)}
                    rows={2}
                    placeholder="Optional note (e.g. 'soccer tournament')"
                    className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
                  />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white p-4">
        <div className="mx-auto flex max-w-6xl items-center justify-end">
          <Button onClick={onSave} disabled={pending} size="lg">
            {pending ? "Saving…" : "Save attendance"}
          </Button>
        </div>
      </div>
    </div>
  );
}
