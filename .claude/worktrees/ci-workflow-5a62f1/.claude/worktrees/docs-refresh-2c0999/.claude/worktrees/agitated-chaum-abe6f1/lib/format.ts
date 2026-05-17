// lib/format.ts
//
// Display helpers. Pure functions, no DB or auth state. Server- and
// client-safe.

import { format, formatDistanceToNow } from "date-fns";

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

export function formatMemberName(
  member: Pick<Member, "first_name" | "last_name" | "preferred_name">,
): string {
  if (member.preferred_name && member.preferred_name.trim().length > 0) {
    return member.preferred_name;
  }
  const lastInitial = member.last_name
    ? `${member.last_name.charAt(0).toUpperCase()}.`
    : "";
  return lastInitial ? `${member.first_name} ${lastInitial}` : member.first_name;
}

export function formatMemberFullName(
  member: Pick<Member, "first_name" | "last_name" | "preferred_name">,
): string {
  // Internal-only: returns the full first + last (or preferred + last) for
  // staff-facing screens. Never use this for outbound prompts — call
  // redactMember() instead.
  const first =
    member.preferred_name && member.preferred_name.trim().length > 0
      ? member.preferred_name
      : member.first_name;
  return member.last_name ? `${first} ${member.last_name}` : first;
}

export function formatAge(birthdate: string | Date, now: Date = new Date()): number {
  const d = typeof birthdate === "string" ? new Date(birthdate) : birthdate;
  if (Number.isNaN(d.getTime())) return 0;
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
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

// ---------------------------------------------------------------------------
// Activities — date helpers
// ---------------------------------------------------------------------------

export function formatActivityDate(starts_at: string | Date): string {
  const d = typeof starts_at === "string" ? new Date(starts_at) : starts_at;
  return format(d, "EEE, MMM d · h:mm a");
}

export function formatActivityDateRange(
  starts_at: string | Date,
  ends_at: string | Date | null,
): string {
  const s = typeof starts_at === "string" ? new Date(starts_at) : starts_at;
  if (!ends_at) return formatActivityDate(s);
  const e = typeof ends_at === "string" ? new Date(ends_at) : ends_at;
  // Same day → "Wed, Nov 13 · 7:00–8:30 PM"; different days → full ranges.
  const sameDay =
    s.getFullYear() === e.getFullYear() &&
    s.getMonth() === e.getMonth() &&
    s.getDate() === e.getDate();
  if (sameDay) {
    return `${format(s, "EEE, MMM d")} · ${format(s, "h:mm")}–${format(e, "h:mm a")}`;
  }
  return `${format(s, "EEE, MMM d, h:mm a")} → ${format(e, "EEE, MMM d, h:mm a")}`;
}

// Sunday-anchored week (LDS convention: Sunday is the first day).
export function startOfWeek(d: Date): Date {
  const result = new Date(d);
  result.setHours(0, 0, 0, 0);
  const day = result.getDay(); // 0 = Sunday
  result.setDate(result.getDate() - day);
  return result;
}

export function endOfWeek(d: Date): Date {
  const start = startOfWeek(d);
  const end = new Date(start);
  end.setDate(end.getDate() + 7); // exclusive upper bound
  return end;
}

export function formatWeekRange(start: Date): string {
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const sameMonth = start.getMonth() === end.getMonth();
  if (sameMonth) {
    return `${format(start, "MMM d")}–${format(end, "d, yyyy")}`;
  }
  return `${format(start, "MMM d")}–${format(end, "MMM d, yyyy")}`;
}

// ISO 'YYYY-MM-DD' for the Sunday of the given date's week (URL-safe).
export function isoSunday(d: Date): string {
  const s = startOfWeek(d);
  return format(s, "yyyy-MM-dd");
}

// 'YYYY-MM-DD' → Date at local midnight.
export function fromIsoDate(value: string): Date {
  const [y, m, d] = value.split("-").map((n) => parseInt(n, 10));
  return new Date(y!, (m! - 1), d!);
}

// ISO timestamp → 'YYYY-MM-DDTHH:mm' for <input type="datetime-local">.
export function toDateTimeLocalInput(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

// 'YYYY-MM-DDTHH:mm' (local) → ISO string with the local tz baked in.
export function fromDateTimeLocalInput(value: string): string {
  return new Date(value).toISOString();
}

export function formatRelativeTime(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return formatDistanceToNow(d, { addSuffix: true });
}
