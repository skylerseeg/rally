// lib/lesson-planner/index.ts
//
// Pure helpers shared by the lesson_planner agent and the server
// action that calls it. Nothing here touches Anthropic or makes
// network calls.

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/supabase/types";

export type QuorumClass = Database["public"]["Enums"]["quorum_class"];

/**
 * Quorum/class → "ages 12-13" style label. Pure mapping.
 *
 * Sunday School is mixed-age and gets a non-numeric band.
 */
export function getAgeBandForQuorum(qc: QuorumClass): string {
  switch (qc) {
    case "deacons":
      return "12-13";
    case "teachers":
      return "14-15";
    case "priests":
      return "16-17";
    case "yw_12_13":
      return "12-13";
    case "yw_14_15":
      return "14-15";
    case "yw_16_17":
      return "16-17";
    case "sunday_school":
      return "mixed (12-17)";
    default: {
      // Exhaustiveness check.
      const _exhaustive: never = qc;
      throw new Error(`Unknown quorum_class: ${String(_exhaustive)}`);
    }
  }
}

/**
 * Last N lessons for a unit, newest first. Used to give the agent
 * context on what's been covered recently so it doesn't propose a
 * lesson the quorum just heard.
 *
 * Pulls only the fields the agent's redactor consumes — no member
 * data, no teacher names. Lesson titles + manual references are
 * public curriculum metadata, not PII.
 */
export type RecentLessonRow = {
  taught_on: string;
  manual: string;
  manual_reference: string;
  outline_summary: string | null;
};

export async function getRecentLessons(
  supabase: SupabaseClient<Database>,
  unitId: string,
  limit = 8,
): Promise<RecentLessonRow[]> {
  const { data, error } = await supabase
    .from("lessons")
    .select("taught_on, manual, manual_reference, outline, notes")
    .eq("unit_id", unitId)
    .order("taught_on", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`getRecentLessons: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    taught_on: row.taught_on,
    manual: row.manual,
    manual_reference: row.manual_reference,
    outline_summary: extractOutlineSummary(row.outline, row.notes),
  }));
}

/**
 * Pull a short human-readable summary from the outline/notes blobs.
 * Best-effort — both fields are jsonb and can hold anything. We look
 * for `notes.title` first (the lesson_planner stores its title there
 * because the lessons table has no title column), then fall back to
 * the first section_title in an outline-shaped object, then null.
 */
function extractOutlineSummary(outline: unknown, notes: unknown): string | null {
  if (notes && typeof notes === "object" && !Array.isArray(notes)) {
    const t = (notes as Record<string, unknown>).title;
    if (typeof t === "string" && t.trim().length > 0) return t.trim();
  }
  if (outline && typeof outline === "object" && !Array.isArray(outline)) {
    const sections = (outline as Record<string, unknown>).outline;
    if (Array.isArray(sections) && sections.length > 0) {
      const first = sections[0];
      if (first && typeof first === "object" && !Array.isArray(first)) {
        const st = (first as Record<string, unknown>).section_title;
        if (typeof st === "string" && st.trim().length > 0) return st.trim();
      }
    }
  }
  return null;
}

/**
 * Parse a manual reference string into a loose structured form. Pure
 * function — no fetching. The agent doesn't NEED this (it works from
 * the raw string), but it's useful for logging/telemetry and lets the
 * server action pre-pick a sensible `manual` value for the lessons
 * row when the leader saves.
 *
 * Examples:
 *   "D&C 76:50–70"   → { book: "D&C", chapter: 76, verses: "50–70",  manual_default: "come_follow_me_<year>" }
 *   "Mosiah 4"       → { book: "Mosiah", chapter: 4, verses: null,    manual_default: "come_follow_me_<year>" }
 *   "John 3:16"      → { book: "John", chapter: 3, verses: "16",     manual_default: "come_follow_me_<year>" }
 *   "Sermon on the Mount" → { book: null, chapter: null, verses: null, manual_default: "come_follow_me_<year>" }
 *
 * The parsing is best-effort. Anything that doesn't match the
 * "<book>[ <chapter>[:<verses>]]" shape returns nulls — the caller
 * still has the raw reference to send to the model.
 */
export type CurriculumContext = {
  reference: string;
  book: string | null;
  chapter: number | null;
  verses: string | null;
  manual_default: string;
};

const REFERENCE_RE =
  /^\s*([1-3]?\s*[A-Za-z&.\s]+?)\s+(\d+)(?::([\d–—\-, ]+))?\s*$/;

export function getCurriculumContext(reference: string): CurriculumContext {
  const manual_default = `come_follow_me_${new Date().getFullYear()}`;
  const m = REFERENCE_RE.exec(reference);
  if (!m) {
    return {
      reference,
      book: null,
      chapter: null,
      verses: null,
      manual_default,
    };
  }
  const [, bookRaw, chapterRaw, versesRaw] = m;
  return {
    reference,
    book: bookRaw!.trim().replace(/\s+/g, " "),
    chapter: Number(chapterRaw),
    verses: versesRaw ? versesRaw.trim() : null,
    manual_default,
  };
}
