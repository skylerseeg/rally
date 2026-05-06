// app/(app)/activities/page.tsx

import { EmptyState } from "@/components/ui/EmptyState";

export default function ActivitiesPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
        Activities
      </h1>
      <EmptyState
        title="Coming soon"
        description="Plan activity nights, record attendance, and pull AI suggestions tailored to your quorum or class."
      />
    </div>
  );
}
