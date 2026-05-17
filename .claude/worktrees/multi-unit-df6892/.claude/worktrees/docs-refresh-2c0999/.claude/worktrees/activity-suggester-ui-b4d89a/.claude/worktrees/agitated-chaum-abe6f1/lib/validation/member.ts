// lib/validation/member.ts
//
// Single source of truth for member input validation. Used by server
// actions in app/(app)/members/actions.ts and by client form types.

import { z } from "zod";

export const PARENT_RELATIONSHIPS = [
  "mother",
  "father",
  "guardian",
  "other",
] as const;

export const parentContactSchema = z.object({
  name: z.string().trim().min(1, "Name required").max(120),
  relationship: z.enum(PARENT_RELATIONSHIPS),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  email: z
    .string()
    .trim()
    .max(200)
    .refine(
      (v) => v === "" || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v),
      "Enter a valid email or leave blank",
    )
    .optional()
    .or(z.literal("")),
  is_primary: z.boolean().default(false),
});

export const memberInputSchema = z.object({
  first_name: z.string().trim().min(1, "First name required").max(80),
  last_name: z.string().trim().min(1, "Last name required").max(80),
  preferred_name: z.string().trim().max(80).optional().or(z.literal("")),
  birthdate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
  parent_contacts: z.array(parentContactSchema).default([]),
  notes_general: z.string().trim().max(4000).optional().or(z.literal("")),
});

export type ParentContact = z.infer<typeof parentContactSchema>;
export type MemberInput = z.infer<typeof memberInputSchema>;
export type ParentRelationship = (typeof PARENT_RELATIONSHIPS)[number];
