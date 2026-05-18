// agents/lesson_planner/__tests__/prompt.test.ts

import { describe, expect, it } from "vitest";

import { buildSystem, buildUserMessage } from "../prompt";

describe("buildSystem", () => {
  it("emits a single text block with cache_control: ephemeral", () => {
    const blocks = buildSystem();
    expect(blocks).toHaveLength(1);
    const [block] = blocks;
    expect(block!.type).toBe("text");
    expect(block!.cache_control).toEqual({ type: "ephemeral" });
  });

  it("references the emit_lesson_plan tool by name (forces structured output)", () => {
    const blocks = buildSystem();
    expect(blocks[0]!.text).toContain("emit_lesson_plan");
  });

  it("includes age-band guidance for each youth tier", () => {
    const text = buildSystem()[0]!.text;
    expect(text).toContain("12-13");
    expect(text).toContain("14-15");
    expect(text).toContain("16-17");
    // Sunday School (mixed-age) guidance must also be present.
    expect(text).toMatch(/mixed/i);
  });

  it("requires age_adaptation_notes to be populated (single most useful field)", () => {
    const text = buildSystem()[0]!.text;
    expect(text).toContain("age_adaptation_notes");
  });

  it("explicitly forbids inventing names or quoting members back", () => {
    const text = buildSystem()[0]!.text;
    expect(text).toMatch(/do not.*invent.*name/i);
    expect(text).toMatch(/never quote it back/i);
  });
});

describe("buildUserMessage", () => {
  it("renders quorum_class, age_band, member_count, manual_reference, and lesson_date", () => {
    const msg = buildUserMessage(
      {
        audience: {
          quorum_class: "teachers",
          age_band: "14-15",
          member_count: 9,
          active_attendance_estimate: null,
        },
        recent_lessons: [],
        teacher_context: null,
      },
      {
        manual_reference: "D&C 76:50-70",
        lesson_date: "2026-05-31",
      },
    );

    expect(msg.role).toBe("user");
    const content = msg.content as string;
    expect(content).toContain("teachers");
    expect(content).toContain("14-15");
    expect(content).toContain("9");
    expect(content).toContain("D&C 76:50-70");
    expect(content).toContain("2026-05-31");
  });

  it("renders recent lessons when present", () => {
    const msg = buildUserMessage(
      {
        audience: {
          quorum_class: "deacons",
          age_band: "12-13",
          member_count: 11,
          active_attendance_estimate: null,
        },
        recent_lessons: [
          {
            weeks_ago: 2,
            manual: "come_follow_me_2026",
            manual_reference: "2 Nephi 31",
            outline_summary: "Doctrine of Christ",
          },
        ],
        teacher_context: null,
      },
      { manual_reference: "Mosiah 4", lesson_date: "2026-05-31" },
    );

    const content = msg.content as string;
    expect(content).toContain("2 Nephi 31");
    expect(content).toContain("Doctrine of Christ");
    expect(content).toContain("2 weeks ago");
  });

  it("renders teacher_context when supplied and falls back to (none) otherwise", () => {
    const withContext = buildUserMessage(
      {
        audience: {
          quorum_class: "priests",
          age_band: "16-17",
          member_count: 6,
          active_attendance_estimate: null,
        },
        recent_lessons: [],
        teacher_context: "First time teaching this quorum.",
      },
      { manual_reference: "Alma 32", lesson_date: "2026-06-07" },
    );
    expect((withContext.content as string)).toContain(
      "First time teaching this quorum.",
    );

    const without = buildUserMessage(
      {
        audience: {
          quorum_class: "priests",
          age_band: "16-17",
          member_count: 6,
          active_attendance_estimate: null,
        },
        recent_lessons: [],
        teacher_context: null,
      },
      { manual_reference: "Alma 32", lesson_date: "2026-06-07" },
    );
    expect((without.content as string)).toMatch(/Teacher context:\s*\n- \(none\)/);
  });
});
