import Link from "next/link";

import { SuggestForm } from "./SuggestForm";

export default function SuggestActivityPage() {
  const defaultDate = nextWednesdayIso(new Date());

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
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Suggest an activity
        </h1>
        <p className="text-sm text-slate-600">
          Claude reads your recent activities and proposes options grounded in
          your quorum&apos;s context.
        </p>
      </div>
      <SuggestForm defaultDate={defaultDate} />
    </div>
  );
}

function nextWednesdayIso(now: Date): string {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  // 0=Sun, 3=Wed. Walk forward to the next strict Wednesday.
  const delta = ((3 - day + 7) % 7) || 7;
  d.setDate(d.getDate() + delta);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
