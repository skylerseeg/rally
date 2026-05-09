// app/(app)/activities/[id]/edit/page.tsx

import Link from "next/link";
import { notFound } from "next/navigation";

import { Card } from "@/components/ui/Card";
import { createClient } from "@/lib/supabase/server";
import { updateActivity } from "../../actions";
import {
  ActivityForm,
  type ActivityFormInitial,
} from "../../_components/ActivityForm";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function EditActivityPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: activity } = await supabase
    .from("activities")
    .select("id, title, description, starts_at, ends_at, location, category")
    .eq("id", id)
    .maybeSingle();

  if (!activity) notFound();

  const initial: ActivityFormInitial = {
    title: activity.title,
    description: activity.description,
    starts_at: activity.starts_at,
    ends_at: activity.ends_at,
    location: activity.location,
    category: activity.category,
  };

  async function action(formData: FormData) {
    "use server";
    return updateActivity(id, formData);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href={`/activities/${id}`}
          className="text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          &larr; Back to activity
        </Link>
      </div>
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
        Edit activity
      </h1>
      <Card>
        <ActivityForm
          action={action}
          initial={initial}
          cancelHref={`/activities/${id}`}
          submitLabel="Save changes"
        />
      </Card>
    </div>
  );
}
