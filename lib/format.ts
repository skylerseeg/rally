// lib/format.ts
//
// Display helpers. Pure functions, no DB or auth state. Server- and
// client-safe.

import { format } from "date-fns";

import type { Database } from "@/supabase/types";

export type Unit = Database["public"]["Tables"]["units"]["Row"];
export type Member = Database["public"]["Tables"]["members"]["Row"];
export type QuorumClass = Database["public"]["Enums"]["quorum_class"];
export type ActivityCategory =
  Database["public"]["Enums"]["activity_category"];
export type UnitRole = Database["public"]["Enums"]["unit_membership_role"];

const QUORUM_CLASS_LABELS: Record<QuorumClass, string> = {
  deacons: "Deacons Quorum",
  teachers: "Teachers Quorum",
  priests: "Priests Quorum",
  yw_12_13: "Young Women 12–13",
  yw_14_15: "Young Women 14–15",
  yw_16_17: "Young Women 16–17",
  sunday_school: "Sunday School",
};

const ROLE_LABELS: Record<UnitRole, string> = {
  leader: "Leader",
  presidency: "Presidency",
  admin: "Admin",
};

const CATEGORY_LABELS: Record<ActivityCategory, string> = {
  spiritual: "Spiritual",
  service: "Service",
  social: "Social",
  physical: "Physical",
  skill: "Skill",
};

export function formatUnitName(unit: Unit): string {
  // Schema-honest: a `unit` is a ward. The spec mentioned a
  // `display_name` and quorum-class fallback, but neither concept lives
  // on units in this schema. Use the ward name directly.
  return unit.name;
}

export function formatQuorumClass(qc: QuorumClass): string {
  return QUORUM_CLASS_LABELS[qc];
}

export function formatMemberName(member: Member): string {
  if (member.preferred_name && member.preferred_name.trim().length > 0) {
    return member.preferred_name;
  }
  const lastInitial = member.last_name
    ? `${member.last_name.charAt(0).toUpperCase()}.`
    : "";
  return lastInitial ? `${member.first_name} ${lastInitial}` : member.first_name;
}

export function formatCallingTitle(
  callingTitle: string | null,
  role: UnitRole,
): string {
  if (callingTitle && callingTitle.trim().length > 0) return callingTitle;
  return ROLE_LABELS[role];
}

export function formatActivityCategory(cat: ActivityCategory | string): string {
  if (cat in CATEGORY_LABELS) {
    return CATEGORY_LABELS[cat as ActivityCategory];
  }
  return cat.charAt(0).toUpperCase() + cat.slice(1);
}

export type DateFormatKind = "short" | "long" | "time" | "weekday";

export function formatDate(
  date: string | Date,
  kind: DateFormatKind,
): string {
  const d = typeof date === "string" ? new Date(date) : date;
  switch (kind) {
    case "short":
      return format(d, "MMM d");
    case "long":
      return format(d, "EEE, MMM d, yyyy");
    case "time":
      return format(d, "h:mm a");
    case "weekday":
      return format(d, "EEEE");
  }
}
