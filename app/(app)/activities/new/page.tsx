// app/(app)/activities/new/page.tsx

import Link from "next/link";

import { Card } from "@/components/ui/Card";
import { createActivity } from "../actions";
import { ActivityForm } from "../_components/ActivityForm";

export default function NewActivityPage() {
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
      <Card>
        <ActivityForm
          action={createActivity}
          cancelHref="/activities"
          submitLabel="Create activity"
        />
      </Card>
    </div>
  );
}
