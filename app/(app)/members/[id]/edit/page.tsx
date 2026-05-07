// app/(app)/members/[id]/edit/page.tsx

import Link from "next/link";
import { notFound } from "next/navigation";

import { Card } from "@/components/ui/Card";
import { createClient } from "@/lib/supabase/server";
import {
  parentContactSchema,
  type ParentContact,
} from "@/lib/validation/member";
import { updateMember } from "../../actions";
import {
  MemberForm,
  type MemberFormInitial,
} from "../../_components/MemberForm";

type Props = {
  params: Promise<{ id: string }>;
};

function readGeneralNote(notes: unknown): string {
  if (!notes || typeof notes !== "object" || Array.isArray(notes)) return "";
  const v = (notes as Record<string, unknown>)["general"];
  return typeof v === "string" ? v : "";
}

function readParentContacts(raw: unknown): ParentContact[] {
  if (!Array.isArray(raw)) return [];
  const out: ParentContact[] = [];
  for (const item of raw) {
    const parsed = parentContactSchema.safeParse(item);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

export default async function EditMemberPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: member } = await supabase
    .from("members")
    .select(
      "id, first_name, last_name, preferred_name, birthdate, parent_contacts, notes",
    )
    .eq("id", id)
    .maybeSingle();

  if (!member) {
    notFound();
  }

  const initial: MemberFormInitial = {
    first_name: member.first_name,
    last_name: member.last_name,
    preferred_name: member.preferred_name,
    birthdate: member.birthdate,
    parent_contacts: readParentContacts(member.parent_contacts),
    notes: { general: readGeneralNote(member.notes) },
  };

  // Bind the id so the action signature matches FormAction.
  async function action(formData: FormData) {
    "use server";
    return updateMember(id, formData);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href={`/members/${id}`}
          className="text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          &larr; Back to member
        </Link>
      </div>
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
        Edit member
      </h1>
      <Card>
        <MemberForm
          action={action}
          initial={initial}
          cancelHref={`/members/${id}`}
          submitLabel="Save changes"
        />
      </Card>
    </div>
  );
}
