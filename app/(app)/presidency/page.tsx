// app/(app)/presidency/page.tsx

import { EmptyState } from "@/components/ui/EmptyState";

export default function PresidencyPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
        Presidency
      </h1>
      <EmptyState
        title="Coming soon"
        description="Presidency meeting notes, action items, and member-insight summaries."
      />
    </div>
  );
}
