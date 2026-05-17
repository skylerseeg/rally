// app/(app)/presidency/invitations/page.tsx
//
// Presidency-only invitations console. Page-level guard: requireUnitAccess
// with role 'presidency' (which admits admin too via role-rank).

import Link from "next/link";
import { headers } from "next/headers";

import { Card } from "@/components/ui/Card";
import { requireUnitAccess } from "@/lib/auth/guards";
import { getActiveUnit } from "@/lib/auth/units";
import { log } from "@/lib/log";
import { createClient } from "@/lib/supabase/server";
import type { InvitationRole } from "@/lib/validation/invitation";
import { createInvitation } from "./actions";
import { InvitationsList } from "./_components/InvitationsList";
import { InviteForm } from "./_components/InviteForm";

async function buildSignInUrl(): Promise<string> {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (fromEnv) {
    return `${fromEnv.replace(/\/$/, "")}/login`;
  }
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto =
    h.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}/login`;
}

export default async function InvitationsPage() {
  const active = await getActiveUnit();
  // Presidency-or-admin guard at the page level. Throws AuthorizationError
  // for plain leaders, which the framework surfaces as a 500 — acceptable
  // until we add a friendly 403 page; this matches the existing pattern.
  await requireUnitAccess(active.unit.id, "presidency");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("invitations")
    .select(
      "id, email, role, calling_title, expires_at, accepted_at, revoked_at, created_at",
    )
    .eq("unit_id", active.unit.id)
    .order("created_at", { ascending: false });

  if (error) {
    log.error({ event: "invitations_list_failed", reason: error.message });
  }

  const invitations = (data ?? []).map((row) => ({
    id: row.id,
    email: row.email,
    role: row.role as InvitationRole,
    calling_title: row.calling_title,
    expires_at: row.expires_at,
    accepted_at: row.accepted_at,
    revoked_at: row.revoked_at,
    created_at: row.created_at,
  }));

  const signInUrl = await buildSignInUrl();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/presidency"
          className="text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          &larr; Back to presidency
        </Link>
      </div>

      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Invitations
        </h1>
        <p className="text-sm text-slate-600">
          Invite leaders to this unit. They&rsquo;ll get access on their next
          sign-in.
        </p>
      </header>

      <Card>
        <InviteForm action={createInvitation} signInUrl={signInUrl} />
      </Card>

      <InvitationsList invitations={invitations} />
    </div>
  );
}
