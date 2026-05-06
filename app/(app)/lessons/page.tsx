// app/(app)/lessons/page.tsx

import { EmptyState } from "@/components/ui/EmptyState";

export default function LessonsPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
        Lessons
      </h1>
      <EmptyState
        title="Coming soon"
        description="Track Sunday lessons and pull lesson outlines from Come, Follow Me."
      />
    </div>
  );
}
