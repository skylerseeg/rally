// agents/lesson_planner/schema.ts
//
// Zod input/output schemas and the Anthropic tool definition for the
// lesson_planner agent.

import { z } from "zod";

export const lessonModeValues = ["standard", "deep"] as const;
export const lessonModeSchema = z.enum(lessonModeValues);
export type LessonMode = z.infer<typeof lessonModeSchema>;

// ---------------------------------------------------------------------------
// Input — what /lessons/plan passes to runLessonPlanner
// ---------------------------------------------------------------------------

export const planInputSchema = z.object({
  manual_reference: z.string().trim().min(2).max(200),
  lesson_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid lesson date"),
  mode: lessonModeSchema.default("standard"),
  teacher_context: z.string().trim().max(800).optional().or(z.literal("")),
});

export type PlanInput = z.input<typeof planInputSchema>;
export type ParsedPlanInput = z.infer<typeof planInputSchema>;

// ---------------------------------------------------------------------------
// Output — what the model returns via the emit_lesson_plan tool
// ---------------------------------------------------------------------------

export const lessonSectionSchema = z.object({
  section_title: z.string().trim().min(3).max(120),
  duration_minutes: z.number().int().min(2).max(60),
  discussion_questions: z
    .array(z.string().trim().min(5).max(400))
    .min(1)
    .max(3),
  teaching_notes: z.string().trim().min(20).max(800),
  scripture_or_quote: z.string().trim().max(800).nullable(),
});

export const lessonPlanOutputSchema = z.object({
  title: z.string().trim().min(3).max(160),
  scripture_focus: z.array(z.string().trim().min(2).max(200)).min(1).max(3),
  themes: z.array(z.string().trim().min(2).max(120)).min(2).max(4),
  opening_question: z.string().trim().min(10).max(400),
  outline: z.array(lessonSectionSchema).min(3).max(5),
  closing_invitation: z.string().trim().min(10).max(500),
  teacher_prep_notes: z.string().trim().min(40).max(1200),
  age_adaptation_notes: z.string().trim().min(20).max(800),
});

export type LessonSection = z.infer<typeof lessonSectionSchema>;
export type LessonPlanOutput = z.infer<typeof lessonPlanOutputSchema>;

// ---------------------------------------------------------------------------
// Anthropic tool definition — forced via tool_choice in index.ts
// ---------------------------------------------------------------------------

export const emitLessonPlanTool = {
  name: "emit_lesson_plan",
  description:
    "Emit a single Sunday lesson plan tailored to the audience and manual " +
    "reference described in the user message. Target 35-40 minutes total " +
    "across 3-5 outline sections.",
  input_schema: {
    type: "object",
    properties: {
      title: { type: "string" },
      scripture_focus: {
        type: "array",
        minItems: 1,
        maxItems: 3,
        items: { type: "string" },
      },
      themes: {
        type: "array",
        minItems: 2,
        maxItems: 4,
        items: { type: "string" },
      },
      opening_question: { type: "string" },
      outline: {
        type: "array",
        minItems: 3,
        maxItems: 5,
        items: {
          type: "object",
          properties: {
            section_title: { type: "string" },
            duration_minutes: { type: "integer", minimum: 2, maximum: 60 },
            discussion_questions: {
              type: "array",
              minItems: 1,
              maxItems: 3,
              items: { type: "string" },
            },
            teaching_notes: { type: "string" },
            scripture_or_quote: { type: ["string", "null"] },
          },
          required: [
            "section_title",
            "duration_minutes",
            "discussion_questions",
            "teaching_notes",
          ],
        },
      },
      closing_invitation: { type: "string" },
      teacher_prep_notes: { type: "string" },
      age_adaptation_notes: { type: "string" },
    },
    required: [
      "title",
      "scripture_focus",
      "themes",
      "opening_question",
      "outline",
      "closing_invitation",
      "teacher_prep_notes",
      "age_adaptation_notes",
    ],
  },
} as const;
