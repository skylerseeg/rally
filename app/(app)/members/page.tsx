// app/(app)/members/page.tsx

import { EmptyState } from "@/components/ui/EmptyState";

export default function MembersPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
        Members
      </h1>
      <EmptyState
        title="Coming soon"
        description="The members list will live here. Add, edit, and review the youth in your quorum or class."
      />
    </div>
  );
}
