// app/(app)/members/[id]/page.tsx

import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  formatAge,
  formatDate,
  formatMemberFullName,
} from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import {
  parentContactSchema,
  type ParentContact,
} from "@/lib/validation/member";
import { DeactivateToggleForm } from "./DeactivateToggleForm";

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

const RELATIONSHIP_LABEL: Record<ParentContact["relationship"], string> = {
  mother: "Mother",
  father: "Father",
  guardian: "Guardian",
  other: "Other",
};

export default async function MemberDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: member, error } = await supabase
    .from("members")
    .select(
      "id, unit_id, first_name, last_name, preferred_name, birthdate, parent_contacts, notes, is_active, created_at",
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !member) {
    notFound();
  }

  const parentContacts = readParentContacts(member.parent_contacts);
  const note = readGeneralNote(member.notes);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/members"
          className="text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          &larr; Back to members
        </Link>
      </div>

      <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              {formatMemberFullName(member)}
            </h1>
            {!member.is_active ? (
              <Badge variant="neutral">Inactive</Badge>
            ) : null}
          </div>
          <p className="text-sm text-slate-600">
            Age {formatAge(member.birthdate)} ·{" "}
            {formatDate(member.birthdate, "long")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/members/${member.id}/edit`}>
            <Button variant="secondary">Edit</Button>
          </Link>
          <DeactivateToggleForm
            memberId={member.id}
            isActive={member.is_active}
          />
        </div>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
          Parent contacts
        </h2>
        {parentContacts.length === 0 ? (
          <EmptyState
            title="No parent contacts"
            description="Add at least one for emergency reach via Edit."
          />
        ) : (
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {parentContacts.map((c, i) => (
              <li key={i}>
                <Card className="flex flex-col gap-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-base font-semibold text-slate-900">
                      {c.name}
                    </p>
                    {c.is_primary ? (
                      <Badge variant="combined">Primary</Badge>
                    ) : null}
                  </div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">
                    {RELATIONSHIP_LABEL[c.relationship]}
                  </p>
                  {c.phone ? (
                    <a
                      href={`tel:${c.phone}`}
                      className="text-sm text-slate-700 hover:text-slate-900"
                    >
                      {c.phone}
                    </a>
                  ) : null}
                  {c.email ? (
                    <a
                      href={`mailto:${c.email}`}
                      className="text-sm text-slate-700 hover:text-slate-900"
                    >
                      {c.email}
                    </a>
                  ) : null}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
          Notes
        </h2>
        {note.trim() === "" ? (
          <EmptyState
            title="No notes yet"
            description="Use Edit to add context for the rest of the presidency."
          />
        ) : (
          <Card>
            <p className="whitespace-pre-wrap text-sm text-slate-800">
              {note}
            </p>
          </Card>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
          Recent attendance
        </h2>
        {/* TODO(P8): query attendance joined to activities, show last 8 */}
        <EmptyState
          title="No attendance yet"
          description="Attendance will appear here once activities are tracked."
        />
      </section>
    </div>
  );
}
