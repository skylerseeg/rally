"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireLeader, requireUnitAccess } from "@/lib/auth/guards";
import { getActiveUnit } from "@/lib/auth/units";
import { getCurriculumContext } from "@/lib/lesson-planner";
import { log } from "@/lib/log";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/supabase/types";

export type CreateResult =
  | { ok: true; id: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

const CreateSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    manual: z.string().trim().min(1).max(80),
    manual_reference: z.string().trim().min(1).max(200),
    taught_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date"),
    quorum_class: z.enum([
      "deacons",
      "teachers",
      "priests",
      "yw_12_13",
      "yw_14_15",
      "yw_16_17",
      "sunday_school",
    ]),
    notes_extra: z.string().trim().max(2000).optional().or(z.literal("")),
    // Serialized JSON of the outline carried from the planner. Optional;
    // a leader can save a lesson without an outline too.
    outline_json: z.string().optional().or(z.literal("")),
    source_suggestion_id: z.string().optional().or(z.literal("")),
  });

export async function createLesson(formData: FormData): Promise<CreateResult> {
  const parsed = CreateSchema.safeParse({
    title: formData.get("title") ?? "",
    manual: formData.get("manual") ?? "",
    manual_reference: formData.get("manual_reference") ?? "",
    taught_on: formData.get("taught_on") ?? "",
    quorum_class: formData.get("quorum_class") ?? "",
    notes_extra: formData.get("notes_extra") ?? "",
    outline_json: formData.get("outline_json") ?? "",
    source_suggestion_id: formData.get("source_suggestion_id") ?? "",
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: "Validation failed",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const { user } = await requireLeader();
  const active = await getActiveUnit();
  await requireUnitAccess(active.unit.id);

  let outline: Json | null = null;
  if (parsed.data.outline_json && parsed.data.outline_json.length > 0) {
    try {
      outline = JSON.parse(parsed.data.outline_json) as Json;
    } catch {
      // Corrupt seed payload — drop the outline rather than failing
      // the save. The leader can still record they taught the lesson.
      outline = null;
    }
  }

  // The lessons table has no `title` column; stash the title in notes
  // along with any extra freeform notes and a back-ref to the
  // agent_suggestions row if this came from the planner. The columns
  // are jsonb so this is the canonical place for soft metadata.
  const notes: Record<string, unknown> = { title: parsed.data.title };
  if (parsed.data.notes_extra && parsed.data.notes_extra.length > 0) {
    notes.general = parsed.data.notes_extra;
  }
  if (
    parsed.data.source_suggestion_id &&
    parsed.data.source_suggestion_id.length > 0
  ) {
    notes.source_suggestion_id = parsed.data.source_suggestion_id;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lessons")
    .insert({
      unit_id: active.unit.id,
      quorum_class: parsed.data.quorum_class,
      taught_on: parsed.data.taught_on,
      manual: parsed.data.manual,
      manual_reference: parsed.data.manual_reference,
      teacher_user_id: user.id,
      outline: outline,
      notes: notes as unknown as Json,
    })
    .select("id")
    .single();

  if (error || !data) {
    log.error({ event: "lesson_create_failed", reason: error?.message });
    return { ok: false, error: "Could not save the lesson." };
  }

  revalidatePath("/lessons");
  redirect("/lessons");
}

// Re-export for the page so it can pre-fill `manual` from the reference.
export { getCurriculumContext };
