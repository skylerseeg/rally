// lib/validation/activity.ts
//
// Single source of truth for activity + attendance input. Mirrors the
// schema in supabase/migrations/0001_initial_schema.sql exactly:
//
//   activity_category    : spiritual | service | social | physical | skill
//   activity_status      : draft | confirmed | completed | cancelled
//   attendance_status    : present | excused | absent | unknown
//   absence_reason_kind  : sports | family_event | travel | sick | work
//                          | school_event | no_response | unknown | other
//
// The DB constraint allows absence_reason_kind on absent / excused /
// unknown. The UI exposes reason capture only on absent for now; a
// future iteration can broaden if needed.

import { z } from "zod";

export const ACTIVITY_CATEGORIES = [
  "spiritual",
  "service",
  "social",
  "physical",
  "skill",
] as const;

export const ATTENDANCE_STATUSES = [
  "present",
  "excused",
  "absent",
  "unknown",
] as const;

export const ABSENCE_REASON_KINDS = [
  "sports",
  "family_event",
  "travel",
  "sick",
  "work",
  "school_event",
  "no_response",
  "unknown",
  "other",
] as const;

export const activityInputSchema = z
  .object({
    title: z.string().trim().min(1, "Title required").max(200),
    description: z
      .string()
      .trim()
      .max(4000)
      .optional()
      .or(z.literal("")),
    starts_at: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Invalid start time"),
    ends_at: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
      .optional()
      .or(z.literal("")),
    location: z
      .string()
      .trim()
      .max(200)
      .optional()
      .or(z.literal("")),
    category: z.enum(ACTIVITY_CATEGORIES),
  })
  .refine(
    (data) => !data.ends_at || data.ends_at > data.starts_at,
    { path: ["ends_at"], message: "End time must be after start time" },
  );

export type ActivityInput = z.infer<typeof activityInputSchema>;
export type ActivityCategory = (typeof ACTIVITY_CATEGORIES)[number];
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];
export type AbsenceReasonKind = (typeof ABSENCE_REASON_KINDS)[number];

export const attendanceMarkSchema = z
  .object({
    member_id: z.uuid(),
    status: z.enum(ATTENDANCE_STATUSES),
    absence_reason_kind: z
      .enum(ABSENCE_REASON_KINDS)
      .nullable()
      .optional(),
    absence_reason_note: z
      .string()
      .trim()
      .max(500)
      .nullable()
      .optional(),
  })
  .refine(
    (m) =>
      m.status === "absent" ||
      m.status === "excused" ||
      m.status === "unknown" ||
      (!m.absence_reason_kind && !m.absence_reason_note),
    {
      path: ["absence_reason_kind"],
      message: "Reason only allowed when absent / excused / unknown",
    },
  );

export type AttendanceMark = z.infer<typeof attendanceMarkSchema>;

export const ABSENCE_REASON_LABELS: Record<AbsenceReasonKind, string> = {
  sports: "Sports",
  family_event: "Family event",
  travel: "Travel",
  sick: "Sick",
  work: "Work",
  school_event: "School event",
  no_response: "No response",
  unknown: "Unknown",
  other: "Other",
};
