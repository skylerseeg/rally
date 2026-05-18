// agents/lesson_planner/__tests__/schema.test.ts

import { describe, expect, it } from "vitest";

import {
  emitLessonPlanTool,
  lessonPlanOutputSchema,
  planInputSchema,
} from "../schema";

function validPlan() {
  return {
    title: "Looking Beyond the Mark",
    scripture_focus: ["Jacob 4:14", "Helaman 12:1-3"],
    themes: ["Centering on Christ", "Avoiding distraction"],
    opening_question:
      "What's something you've been told to do that didn't make sense at the time?",
    outline: [
      {
        section_title: "What does it mean to 'look beyond the mark'?",
        duration_minutes: 8,
        discussion_questions: [
          "What examples do you see today of people focusing on the wrong target?",
        ],
        teaching_notes:
          "Open with Jacob 4:14. Have a class member read it aloud. Pause and ask the group to paraphrase in their own words.",
        scripture_or_quote: "Jacob 4:14",
      },
      {
        section_title: "Application: What's our 'mark'?",
        duration_minutes: 12,
        discussion_questions: [
          "What is the central message of the gospel?",
          "How do good things sometimes distract from the best things?",
        ],
        teaching_notes:
          "Invite the class to brainstorm 'good but not best' activities or pursuits. Write them on the board. Discuss the difference between busy and faithful.",
        scripture_or_quote: null,
      },
      {
        section_title: "Centering on Christ",
        duration_minutes: 10,
        discussion_questions: [
          "What practices help you keep Christ at the center of your week?",
        ],
        teaching_notes:
          "Share a brief personal example of refocusing after distraction. Invite class members to share if comfortable; don't call on anyone.",
        scripture_or_quote: "Helaman 12:1-3",
      },
    ],
    closing_invitation:
      "This week, pick one practice that helps you center on Christ and commit to it.",
    teacher_prep_notes:
      "Read Jacob 4:14 and Helaman 12:1-3 ahead of time. Think about a moment when you realized you were focused on the wrong thing. Be ready to share briefly. Bring scripture markers.",
    age_adaptation_notes:
      "For 14-15 year olds: keep the application concrete. Avoid abstract theological tangents — the strength is in seeing the gospel apply to daily decisions they actually make.",
  };
}

describe("lessonPlanOutputSchema", () => {
  it("accepts a well-formed plan", () => {
    const parsed = lessonPlanOutputSchema.safeParse(validPlan());
    expect(parsed.success).toBe(true);
  });

  it("rejects a plan with fewer than 3 outline sections", () => {
    const plan = validPlan();
    plan.outline = plan.outline.slice(0, 2);
    const parsed = lessonPlanOutputSchema.safeParse(plan);
    expect(parsed.success).toBe(false);
  });

  it("rejects a plan with more than 5 outline sections", () => {
    const plan = validPlan();
    plan.outline = [...plan.outline, ...plan.outline]; // 6 sections
    const parsed = lessonPlanOutputSchema.safeParse(plan);
    expect(parsed.success).toBe(false);
  });

  it("rejects a section with zero discussion questions", () => {
    const plan = validPlan();
    plan.outline[0]!.discussion_questions = [];
    const parsed = lessonPlanOutputSchema.safeParse(plan);
    expect(parsed.success).toBe(false);
  });

  it("rejects fewer than 2 themes", () => {
    const plan = validPlan();
    plan.themes = ["only one"];
    const parsed = lessonPlanOutputSchema.safeParse(plan);
    expect(parsed.success).toBe(false);
  });

  it("rejects more than 3 scripture_focus entries", () => {
    const plan = validPlan();
    plan.scripture_focus = ["a", "b", "c", "d"];
    const parsed = lessonPlanOutputSchema.safeParse(plan);
    expect(parsed.success).toBe(false);
  });

  it("allows scripture_or_quote to be null on a section", () => {
    const plan = validPlan();
    plan.outline[1]!.scripture_or_quote = null;
    const parsed = lessonPlanOutputSchema.safeParse(plan);
    expect(parsed.success).toBe(true);
  });
});

describe("planInputSchema", () => {
  it("accepts a minimal valid input and defaults mode to standard", () => {
    const parsed = planInputSchema.safeParse({
      manual_reference: "D&C 76:50-70",
      lesson_date: "2026-05-31",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.mode).toBe("standard");
    }
  });

  it("rejects a malformed lesson_date", () => {
    const parsed = planInputSchema.safeParse({
      manual_reference: "D&C 76:50-70",
      lesson_date: "next sunday",
    });
    expect(parsed.success).toBe(false);
  });

  it("accepts mode=deep when supplied", () => {
    const parsed = planInputSchema.safeParse({
      manual_reference: "Mosiah 4",
      lesson_date: "2026-05-31",
      mode: "deep",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.mode).toBe("deep");
    }
  });
});

describe("emitLessonPlanTool", () => {
  it("declares the expected tool name and required keys", () => {
    expect(emitLessonPlanTool.name).toBe("emit_lesson_plan");
    expect(emitLessonPlanTool.input_schema.required).toContain("title");
    expect(emitLessonPlanTool.input_schema.required).toContain("outline");
    expect(emitLessonPlanTool.input_schema.required).toContain(
      "teacher_prep_notes",
    );
    expect(emitLessonPlanTool.input_schema.required).toContain(
      "age_adaptation_notes",
    );
  });
});
