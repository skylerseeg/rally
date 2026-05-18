// app/(app)/lessons/page.tsx

import Link from "next/link";
import { Sparkles } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";

export default function LessonsPage() {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Lessons
        </h1>
        <div className="flex items-center gap-2">
          <Link href="/lessons/plan">
            <Button variant="secondary">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              Plan a lesson with AI
            </Button>
          </Link>
          <Link href="/lessons/new">
            <Button>New lesson</Button>
          </Link>
        </div>
      </header>

      <EmptyState
        title="Coming soon"
        description="Track Sunday lessons and pull lesson outlines from Come, Follow Me. The full lessons list lands in a follow-up; the planner and the save-a-lesson form work today."
      />
    </div>
  );
}
