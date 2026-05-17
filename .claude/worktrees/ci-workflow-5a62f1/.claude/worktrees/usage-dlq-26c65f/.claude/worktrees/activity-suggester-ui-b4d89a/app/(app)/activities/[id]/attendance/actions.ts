"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireLeader, requireUnitAccess } from "@/lib/auth/guards";
import { getActiveUnit } from "@/lib/auth/units";
import { log } from "@/lib/log";
import { createClient } from "@/lib/supabase/server";
import { attendanceMarkSchema } from "@/lib/validation/activity";

const bulkSchema = z.object({
  activity_id: z.uuid(),
  marks: z.array(attendanceMarkSchema).min(1),
});

export async function recordAttendance(
  input: unknown,
): Promise<{ ok: boolean; error?: string }> {
  const { user } = await requireLeader();
  let active;
  try {
    active = await getActiveUnit();
  } catch {
    return { ok: false, error: "No active unit" };
  }
  await requireUnitAccess(active.unit.id);

  const parsed = bulkSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Validation failed" };
  }

  const supabase = await createClient();
  const rows = parsed.data.marks.map((m) => ({
    unit_id: active.unit.id,
    activity_id: parsed.data.activity_id,
    member_id: m.member_id,
    status: m.status,
    // Belt-and-suspenders: clear reasons for non-absent rows even though
    // the schema check would also accept them on excused/unknown.
    absence_reason_kind:
      m.status === "absent" ? (m.absence_reason_kind ?? null) : null,
    absence_reason_note:
      m.status === "absent" ? (m.absence_reason_note ?? null) : null,
    recorded_by: user.id,
    recorded_at: new Date().toISOString(),
  }));

  // upsert respects the unique (activity_id, member_id) index without
  // a destructive delete + insert pair.
  const { error } = await supabase
    .from("attendance")
    .upsert(rows, { onConflict: "activity_id,member_id" });

  if (error) {
    log.error({
      event: "record_attendance_failed",
      activity_id: parsed.data.activity_id,
      reason: error.message,
    });
    return { ok: false, error: "Could not save attendance." };
  }

  revalidatePath(`/activities/${parsed.data.activity_id}`);
  revalidatePath("/activities");
  revalidatePath("/");
  return { ok: true };
}
