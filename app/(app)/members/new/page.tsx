// app/(app)/members/new/page.tsx

import Link from "next/link";

import { Card } from "@/components/ui/Card";
import { createMember } from "../actions";
import { MemberForm } from "../_components/MemberForm";

export default function NewMemberPage() {
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
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
        Add member
      </h1>
      <Card>
        <MemberForm
          action={createMember}
          cancelHref="/members"
          submitLabel="Create member"
        />
      </Card>
    </div>
  );
}
