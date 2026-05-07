"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireLeader, requireUnitAccess } from "@/lib/auth/guards";
import { getActiveUnit } from "@/lib/auth/units";
import { log } from "@/lib/log";
import { createClient } from "@/lib/supabase/server";
import { memberInputSchema } from "@/lib/validation/member";

export type ActionResult =
  | { ok: true; id?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

function parseFormData(fd: FormData): Record<string, unknown> {
  const parent_contacts_raw = fd.get("parent_contacts_json");
  let parent_contacts: unknown = [];
  if (typeof parent_contacts_raw === "string" && parent_contacts_raw.length > 0) {
    try {
      parent_contacts = JSON.parse(parent_contacts_raw);
    } catch {
      parent_contacts = [];
    }
  }
  return {
    first_name: fd.get("first_name") ?? "",
    last_name: fd.get("last_name") ?? "",
    preferred_name: fd.get("preferred_name") ?? "",
    birthdate: fd.get("birthdate") ?? "",
    parent_contacts,
    notes_general: fd.get("notes_general") ?? "",
  };
}

async function ensureWriteAccess(): Promise<{ unitId: string } | { error: string }> {
  await requireLeader();
  let active;
  try {
    active = await getActiveUnit();
  } catch {
    return { error: "No active unit" };
  }
  await requireUnitAccess(active.unit.id);
  return { unitId: active.unit.id };
}

export async function createMember(formData: FormData): Promise<ActionResult> {
  const access = await ensureWriteAccess();
  if ("error" in access) return { ok: false, error: access.error };

  const parsed = memberInputSchema.safeParse(parseFormData(formData));
  if (!parsed.success) {
    return {
      ok: false,
      error: "Validation failed",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("members")
    .insert({
      unit_id: access.unitId,
      first_name: parsed.data.first_name,
      last_name: parsed.data.last_name,
      preferred_name: parsed.data.preferred_name || null,
      birthdate: parsed.data.birthdate,
      // jsonb columns; the Database type widens to Json so the cast is safe.
      parent_contacts: parsed.data.parent_contacts,
      notes: { general: parsed.data.notes_general || "" },
      // quorum_class isn't on the form yet — default to deacons since this is
      // the only seeded ward. When ward-or-quorum scoping lands, surface this.
      quorum_class: "deacons",
      is_active: true,
    })
    .select("id")
    .single();

  if (error || !data) {
    log.error({ event: "member_create_failed", reason: error?.message });
    return { ok: false, error: "Could not create member." };
  }

  revalidatePath("/members");
  redirect(`/members/${data.id}`);
}

export async function updateMember(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  const access = await ensureWriteAccess();
  if ("error" in access) return { ok: false, error: access.error };

  const parsed = memberInputSchema.safeParse(parseFormData(formData));
  if (!parsed.success) {
    return {
      ok: false,
      error: "Validation failed",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("members")
    .update({
      first_name: parsed.data.first_name,
      last_name: parsed.data.last_name,
      preferred_name: parsed.data.preferred_name || null,
      birthdate: parsed.data.birthdate,
      parent_contacts: parsed.data.parent_contacts,
      notes: { general: parsed.data.notes_general || "" },
    })
    .eq("id", id)
    .eq("unit_id", access.unitId);

  if (error) {
    log.error({ event: "member_update_failed", id, reason: error.message });
    return { ok: false, error: "Could not save changes." };
  }

  revalidatePath("/members");
  revalidatePath(`/members/${id}`);
  redirect(`/members/${id}`);
}

export async function deactivateMember(id: string): Promise<ActionResult> {
  const access = await ensureWriteAccess();
  if ("error" in access) return { ok: false, error: access.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("members")
    .update({ is_active: false })
    .eq("id", id)
    .eq("unit_id", access.unitId);

  if (error) {
    log.error({ event: "member_deactivate_failed", id, reason: error.message });
    return { ok: false, error: "Could not deactivate." };
  }

  revalidatePath("/members");
  revalidatePath(`/members/${id}`);
  return { ok: true, id };
}

export async function reactivateMember(id: string): Promise<ActionResult> {
  const access = await ensureWriteAccess();
  if ("error" in access) return { ok: false, error: access.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("members")
    .update({ is_active: true })
    .eq("id", id)
    .eq("unit_id", access.unitId);

  if (error) {
    log.error({ event: "member_reactivate_failed", id, reason: error.message });
    return { ok: false, error: "Could not reactivate." };
  }

  revalidatePath("/members");
  revalidatePath(`/members/${id}`);
  return { ok: true, id };
}
