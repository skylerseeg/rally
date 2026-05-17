// lib/validation/invitation.ts
//
// Single source of truth for invitation input validation. Used by the
// presidency invitations server actions.

import { z } from "zod";

export const INVITATION_ROLES = ["leader", "presidency", "admin"] as const;
export type InvitationRole = (typeof INVITATION_ROLES)[number];

export const invitationInputSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254)
    .refine(
      (v) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v),
      "Enter a valid email",
    ),
  role: z.enum(INVITATION_ROLES),
  calling_title: z.string().trim().max(120).optional().or(z.literal("")),
});

export type InvitationInput = z.infer<typeof invitationInputSchema>;

export const ROLE_LABEL: Record<InvitationRole, string> = {
  leader: "Leader",
  presidency: "Presidency",
  admin: "Admin",
};
