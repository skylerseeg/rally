"use server";

import { revalidatePath } from "next/cache";

import { requireLeader, requireUnitAccess } from "@/lib/auth/guards";
import { getActiveUnit } from "@/lib/auth/units";
import { log } from "@/lib/log";
import { createClient } from "@/lib/supabase/server";
import { invitationInputSchema } from "@/lib/validation/invitation";

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

async function ensurePresidency(): Promise<
  { unitId: string; userId: string; userEmail: string | null } | { error: string }
> {
  const { user } = await requireLeader();
  let active;
  try {
    active = await getActiveUnit();
  } catch {
    return { error: "No active unit" };
  }
  // requireUnitAccess(unitId, "presidency") admits presidency or admin
  // because the role-rank table treats presidency < admin. See
  // lib/auth/guards.ts.
  await requireUnitAccess(active.unit.id, "presidency");
  return { unitId: active.unit.id, userId: user.id, userEmail: user.email ?? null };
}

export async function createInvitation(formData: FormData): Promise<ActionResult> {
  const access = await ensurePresidency();
  if ("error" in access) return { ok: false, error: access.error };

  const parsed = invitationInputSchema.safeParse({
    email: formData.get("email") ?? "",
    role: formData.get("role") ?? "",
    calling_title: formData.get("calling_title") ?? "",
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: "Validation failed",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  // Block self-invites — they're noise.
  if (
    access.userEmail &&
    access.userEmail.toLowerCase() === parsed.data.email
  ) {
    return { ok: false, error: "You already have access to this unit." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("invitations").insert({
    unit_id: access.unitId,
    email: parsed.data.email,
    role: parsed.data.role,
    calling_title: parsed.data.calling_title || null,
    invited_by: access.userId,
  });

  if (error) {
    if (error.code === "23505") {
      return {
        ok: false,
        error: "There is already a pending invitation for this email.",
      };
    }
    log.error({ event: "invitation_create_failed", reason: error.message });
    return { ok: false, error: "Could not create invitation." };
  }

  revalidatePath("/presidency/invitations");
  return { ok: true };
}

export async function revokeInvitation(id: string): Promise<ActionResult> {
  const access = await ensurePresidency();
  if ("error" in access) return { ok: false, error: access.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("invitations")
    .update({
      revoked_at: new Date().toISOString(),
      revoked_by: access.userId,
    })
    .eq("id", id)
    .eq("unit_id", access.unitId)
    .is("accepted_at", null)
    .is("revoked_at", null);

  if (error) {
    log.error({ event: "invitation_revoke_failed", id, reason: error.message });
    return { ok: false, error: "Could not revoke invitation." };
  }

  revalidatePath("/presidency/invitations");
  return { ok: true };
}

export async function resendInvitation(id: string): Promise<ActionResult> {
  // No email yet; "resend" just bumps expires_at by 14 days.
  const access = await ensurePresidency();
  if ("error" in access) return { ok: false, error: access.error };

  const supabase = await createClient();
  const newExpiry = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await supabase
    .from("invitations")
    .update({ expires_at: newExpiry })
    .eq("id", id)
    .eq("unit_id", access.unitId)
    .is("accepted_at", null)
    .is("revoked_at", null);

  if (error) {
    log.error({ event: "invitation_resend_failed", id, reason: error.message });
    return { ok: false, error: "Could not extend expiration." };
  }

  revalidatePath("/presidency/invitations");
  return { ok: true };
}
