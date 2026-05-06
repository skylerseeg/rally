// lib/auth/guards.ts
//
// Auth guards used by server components, server actions, and route
// handlers. Per docs/auth-env.md:
//
//   getOptionalUser()  -> User | null
//   requireUser()      -> User; redirects to /login if not signed in
//   requireLeader()    -> { user, memberships }; redirects to
//                         /onboarding/no-access if memberships empty
//   requireUnitAccess  -> { user, memberships, membership }; throws
//                         AuthorizationError on missing role/unit
//
// Provider-agnostic: nothing in here cares whether the session came
// from magic link or Google OAuth. Adding a new provider doesn't change
// these guards.

import { redirect } from "next/navigation";

import { createClient, type User } from "@/lib/supabase/server";
import { AuthorizationError } from "@/lib/errors";
import type { Database } from "@/supabase/types";

export type UnitMembership =
  Database["public"]["Tables"]["unit_memberships"]["Row"];
export type UnitRole = Database["public"]["Enums"]["unit_membership_role"];

export type LeaderContext = {
  user: User;
  memberships: UnitMembership[];
};

export type UnitAccessContext = LeaderContext & {
  membership: UnitMembership;
};

const ROLE_RANK: Record<UnitRole, number> = {
  leader: 1,
  presidency: 2,
  admin: 3,
};

export async function getOptionalUser(): Promise<User | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
}

export async function requireUser(): Promise<User> {
  const user = await getOptionalUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireLeader(): Promise<LeaderContext> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("unit_memberships")
    .select("*")
    .eq("user_id", user.id);

  if (error) {
    throw new AuthorizationError(
      `requireLeader: failed to load memberships (${error.message})`,
    );
  }

  const memberships = data ?? [];
  if (memberships.length === 0) {
    redirect("/onboarding/no-access");
  }

  return { user, memberships };
}

export async function requireUnitAccess(
  unitId: string,
  role?: UnitRole,
): Promise<UnitAccessContext> {
  const ctx = await requireLeader();
  const membership = ctx.memberships.find((m) => m.unit_id === unitId);

  if (!membership) {
    throw new AuthorizationError(
      `requireUnitAccess: user has no membership in unit ${unitId}`,
    );
  }

  if (role && ROLE_RANK[membership.role] < ROLE_RANK[role]) {
    throw new AuthorizationError(
      `requireUnitAccess: role ${membership.role} is below required ${role}`,
    );
  }

  return { ...ctx, membership };
}
