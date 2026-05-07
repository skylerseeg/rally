// app/(app)/members/page.tsx
//
// Members list. Active by default; toggle ?inactive=1 to include inactive.

import Link from "next/link";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { getActiveUnit } from "@/lib/auth/units";
import { formatAge, formatMemberFullName } from "@/lib/format";
import { log } from "@/lib/log";
import { createClient } from "@/lib/supabase/server";
import { InactiveToggle } from "./_components/InactiveToggle";

type Props = {
  searchParams: Promise<{ inactive?: string }>;
};

export default async function MembersPage({ searchParams }: Props) {
  const params = await searchParams;
  const showInactive = params.inactive === "1";

  const active = await getActiveUnit();
  const unitId = active.unit.id;
  const supabase = await createClient();

  let query = supabase
    .from("members")
    .select("id, first_name, last_name, preferred_name, birthdate, is_active")
    .eq("unit_id", unitId)
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true });

  if (!showInactive) {
    query = query.eq("is_active", true);
  }

  const { data, error } = await query;
  if (error) {
    log.error({ event: "members_list_failed", reason: error.message });
  }
  const members = data ?? [];

  // Counts for the header badge.
  const { count: activeCount } = await supabase
    .from("members")
    .select("*", { count: "exact", head: true })
    .eq("unit_id", unitId)
    .eq("is_active", true);
  const { count: totalCount } = await supabase
    .from("members")
    .select("*", { count: "exact", head: true })
    .eq("unit_id", unitId);
  const inactiveCount = (totalCount ?? 0) - (activeCount ?? 0);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Members
          </h1>
          <p className="text-sm text-slate-600">
            {activeCount ?? 0} active
            {inactiveCount > 0 ? ` · ${inactiveCount} inactive` : ""}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <InactiveToggle showInactive={showInactive} />
          <Link href="/members/new">
            <Button>Add member</Button>
          </Link>
        </div>
      </header>

      {members.length === 0 ? (
        <EmptyState
          title={showInactive ? "No members match" : "No members yet"}
          description={
            showInactive
              ? "Toggle inactive off, or add a new member."
              : "Add your first quorum member to start tracking activities and attendance."
          }
          action={
            <Link href="/members/new">
              <Button>Add member</Button>
            </Link>
          }
        />
      ) : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {members.map((m) => (
            <li key={m.id}>
              <Link href={`/members/${m.id}`} className="block">
                <Card className="flex h-full flex-col gap-1 transition-shadow hover:shadow-md">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="text-base font-semibold text-slate-900">
                      {formatMemberFullName(m)}
                    </h2>
                    {!m.is_active ? (
                      <Badge variant="neutral">Inactive</Badge>
                    ) : null}
                  </div>
                  <p className="text-sm text-slate-600">
                    Age {formatAge(m.birthdate)}
                  </p>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
