"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireLeader, requireUnitAccess } from "@/lib/auth/guards";
import { getActiveUnit } from "@/lib/auth/units";
import { fromDateTimeLocalInput } from "@/lib/format";
import { log } from "@/lib/log";
import { createClient } from "@/lib/supabase/server";
import { activityInputSchema } from "@/lib/validation/activity";

export type ActionResult =
  | { ok: true; id?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

function parseFormData(fd: FormData): Record<string, unknown> {
  return {
    title: fd.get("title") ?? "",
    description: fd.get("description") ?? "",
    starts_at: fd.get("starts_at") ?? "",
    ends_at: fd.get("ends_at") ?? "",
    location: fd.get("location") ?? "",
    category: fd.get("category") ?? "",
  };
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function readSourceSuggestionId(fd: FormData): string | null {
  const raw = String(fd.get("source_suggestion_id") ?? "").trim();
  return UUID_RE.test(raw) ? raw : null;
}

async function ensureWriteAccess(): Promise<
  { unitId: string; userId: string } | { error: string }
> {
  const { user } = await requireLeader();
  let active;
  try {
    active = await getActiveUnit();
  } catch {
    return { error: "No active unit" };
  }
  await requireUnitAccess(active.unit.id);
  return { unitId: active.unit.id, userId: user.id };
}

export async function createActivity(formData: FormData): Promise<ActionResult> {
  const access = await ensureWriteAccess();
  if ("error" in access) return { ok: false, error: access.error };

  const parsed = activityInputSchema.safeParse(parseFormData(formData));
  if (!parsed.success) {
    return {
      ok: false,
      error: "Validation failed",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const supabase = await createClient();
  const sourceSuggestionId = readSourceSuggestionId(formData);
  const { data, error } = await supabase
    .from("activities")
    .insert({
      unit_id: access.unitId,
      // quorum_class is NOT NULL with no default. Default to deacons —
      // only ward we have. Surface this when multiple quorums need
      // independent activity calendars.
      quorum_class: "deacons",
      title: parsed.data.title,
      description: parsed.data.description || null,
      starts_at: fromDateTimeLocalInput(parsed.data.starts_at),
      ends_at: parsed.data.ends_at
        ? fromDateTimeLocalInput(parsed.data.ends_at)
        : null,
      location: parsed.data.location || null,
      category: parsed.data.category,
      planned_by: access.userId,
      source_suggestion_id: sourceSuggestionId,
      ai_suggested: sourceSuggestionId !== null,
    })
    .select("id")
    .single();

  if (error || !data) {
    log.error({ event: "activity_create_failed", reason: error?.message });
    return { ok: false, error: "Could not create activity." };
  }

  revalidatePath("/activities");
  revalidatePath("/");
  redirect(`/activities/${data.id}`);
}

export async function updateActivity(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  const access = await ensureWriteAccess();
  if ("error" in access) return { ok: false, error: access.error };

  const parsed = activityInputSchema.safeParse(parseFormData(formData));
  if (!parsed.success) {
    return {
      ok: false,
      error: "Validation failed",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("activities")
    .update({
      title: parsed.data.title,
      description: parsed.data.description || null,
      starts_at: fromDateTimeLocalInput(parsed.data.starts_at),
      ends_at: parsed.data.ends_at
        ? fromDateTimeLocalInput(parsed.data.ends_at)
        : null,
      location: parsed.data.location || null,
      category: parsed.data.category,
    })
    .eq("id", id)
    .eq("unit_id", access.unitId);

  if (error) {
    log.error({ event: "activity_update_failed", id, reason: error.message });
    return { ok: false, error: "Could not save changes." };
  }

  revalidatePath("/activities");
  revalidatePath(`/activities/${id}`);
  revalidatePath("/");
  redirect(`/activities/${id}`);
}

export async function deleteActivity(id: string): Promise<ActionResult> {
  const access = await ensureWriteAccess();
  if ("error" in access) return { ok: false, error: access.error };

  // attendance rows cascade-delete via the FK in 0001_initial_schema.sql.
  const supabase = await createClient();
  const { error } = await supabase
    .from("activities")
    .delete()
    .eq("id", id)
    .eq("unit_id", access.unitId);

  if (error) {
    log.error({ event: "activity_delete_failed", id, reason: error.message });
    return { ok: false, error: "Could not delete activity." };
  }

  revalidatePath("/activities");
  revalidatePath("/");
  redirect("/activities");
}
