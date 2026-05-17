// app/(app)/layout.tsx

import type { ReactNode } from "react";

import { AppShell } from "@/components/shell/AppShell";
import { requireLeader } from "@/lib/auth/guards";
import { getAccessibleUnits, getActiveUnit } from "@/lib/auth/units";

export default async function AppGroupLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { user } = await requireLeader();
  const memberships = await getAccessibleUnits();
  const activeUnit = await getActiveUnit();

  return (
    <AppShell
      user={{ id: user.id, email: user.email ?? null }}
      memberships={memberships}
      activeUnit={activeUnit}
    >
      {children}
    </AppShell>
  );
}
