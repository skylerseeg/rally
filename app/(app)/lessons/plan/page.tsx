import Link from "next/link";

import { PlanForm } from "./PlanForm";

export default function PlanLessonPage() {
  const defaultDate = nextSundayIso(new Date());
  const deepEnabled = process.env.RALLY_FLAG_LESSON_PLANNER_DEEP === "true";

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
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Plan a lesson
        </h1>
        <p className="text-sm text-slate-600">
          Claude reads your recent lessons and the audience age band, then
          drafts a 35–40 minute outline grounded in the manual reference you
          provide.
        </p>
      </div>
      <PlanForm defaultDate={defaultDate} deepEnabled={deepEnabled} />
    </div>
  );
}

function nextSundayIso(now: Date): string {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  // 0=Sun. Walk forward to the next strict Sunday.
  const delta = ((0 - day + 7) % 7) || 7;
  d.setDate(d.getDate() + delta);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
