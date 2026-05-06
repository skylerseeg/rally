// lib/auth/units.ts
//
// Helpers for working with the calling user's accessible units and the
// active-unit cookie.
//
//   getAccessibleUnits()  -> [{ unit, role, calling_title }]
//   getActiveUnit()       -> the user's currently selected unit
//   setActiveUnit(id)     -> writes the rally_active_unit cookie
//
// Cookie lookup is delegated to next/headers, so these helpers only
// work on the server. Browser code should round-trip through a server
// action that calls setActiveUnit().

import { cookies } from "next/headers";

import { createClient } from "@/lib/supabase/server";
import { requireLeader } from "@/lib/auth/guards";
import { AuthorizationError, NotFoundError } from "@/lib/errors";
import type { Database } from "@/supabase/types";

const ACTIVE_UNIT_COOKIE = "rally_active_unit";

export type Unit = Database["public"]["Tables"]["units"]["Row"];
export type UnitMembership =
  Database["public"]["Tables"]["unit_memberships"]["Row"];
export type UnitRole = Database["public"]["Enums"]["unit_membership_role"];

export type AccessibleUnit = {
  unit: Unit;
  role: UnitRole;
  calling_title: string | null;
};

export async function getAccessibleUnits(): Promise<AccessibleUnit[]> {
  const { memberships } = await requireLeader();
  if (memberships.length === 0) return [];

  const supabase = await createClient();
  const unitIds = memberships.map((m) => m.unit_id);
  const { data: units, error } = await supabase
    .from("units")
    .select("*")
    .in("id", unitIds);

  if (error) {
    throw new AuthorizationError(
      `getAccessibleUnits: failed to load units (${error.message})`,
    );
  }

  const unitsById = new Map((units ?? []).map((u) => [u.id, u]));
  const result: AccessibleUnit[] = [];
  for (const m of memberships) {
    const unit = unitsById.get(m.unit_id);
    if (!unit) continue;
    result.push({
      unit,
      role: m.role,
      calling_title: m.calling_title,
    });
  }
  return result;
}

export async function getActiveUnit(): Promise<AccessibleUnit> {
  const accessible = await getAccessibleUnits();
  if (accessible.length === 0) {
    throw new NotFoundError(
      "getActiveUnit: user has no accessible units",
    );
  }

  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(ACTIVE_UNIT_COOKIE)?.value;
  if (cookieValue) {
    const match = accessible.find((a) => a.unit.id === cookieValue);
    if (match) return match;
  }

  return accessible[0]!;
}

export async function setActiveUnit(unitId: string): Promise<void> {
  // Validate that the user actually has access to this unit before
  // pinning the cookie. Avoids a malformed client request poisoning
  // their session.
  const accessible = await getAccessibleUnits();
  const match = accessible.find((a) => a.unit.id === unitId);
  if (!match) {
    throw new AuthorizationError(
      `setActiveUnit: user has no access to unit ${unitId}`,
    );
  }

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_UNIT_COOKIE, unitId, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    // 30 days
    maxAge: 60 * 60 * 24 * 30,
  });
}
