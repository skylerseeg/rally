// agents/lesson_planner/__tests__/integration.test.ts
//
// Three core scenarios that drive the tier-selection contract:
//   1. mode="standard" (regardless of flag)            → tier "default"
//   2. mode="deep"   + flag=true                       → tier "deep"
//   3. mode="deep"   + flag missing or not "true"      → tier "default" (deny)
// Plus: successful parse round-trip and the no-tool-input error path.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---- Mocks (hoisted) ------------------------------------------------------

vi.mock("@/lib/anthropic", () => ({
  withUsage: vi.fn(),
}));

// ---- Imports under test ---------------------------------------------------

import { withUsage } from "@/lib/anthropic";
import type { Member } from "@/lib/redact";
import type { AgentCallResult } from "@/lib/anthropic";

import {
  resolveTier,
  runLessonPlanner,
  type RunLessonPlannerInput,
} from "../index";

// ---- Fixtures -------------------------------------------------------------

function makeMember(overrides: Partial<Member> = {}): Member {
  return {
    id: "member-uuid-001",
    unit_id: "unit-uuid-001",
    quorum_class: "teachers" as Member["quorum_class"],
    first_name: "Ammon",
    last_name: "Whitmer",
    preferred_name: null,
    birthdate: "2011-02-09",
    parent_contacts: null as unknown as Member["parent_contacts"],
    notes: null,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function validToolInput() {
  return {
    title: "Looking Beyond the Mark",
    scripture_focus: ["Jacob 4:14"],
    themes: ["Centering on Christ", "Avoiding distraction"],
    opening_question:
      "When have you been told to do something that didn't make sense at first?",
    outline: [
      {
        section_title: "What does it mean to 'look beyond the mark'?",
        duration_minutes: 8,
        discussion_questions: [
          "What examples do you see of focusing on the wrong target?",
        ],
        teaching_notes:
          "Open with Jacob 4:14 and have someone read aloud. Pause for class to paraphrase.",
        scripture_or_quote: "Jacob 4:14",
      },
      {
        section_title: "Application",
        duration_minutes: 14,
        discussion_questions: [
          "How can good things distract from best things?",
          "What's a 'mark' you've struggled to keep in view?",
        ],
        teaching_notes:
          "List 'good but not best' activities. Discuss the difference between busy and faithful.",
        scripture_or_quote: null,
      },
      {
        section_title: "Center on Christ",
        duration_minutes: 13,
        discussion_questions: [
          "What practices keep Christ at the center of your week?",
        ],
        teaching_notes:
          "Share a brief refocus story. Invite voluntary sharing — never call on anyone.",
        scripture_or_quote: "Helaman 12:1-3",
      },
    ],
    closing_invitation:
      "Pick one practice this week that helps you center on Christ.",
    teacher_prep_notes:
      "Read Jacob 4:14 and Helaman 12:1-3. Think about a moment you refocused after distraction. Be ready to share briefly. Bring scripture markers.",
    age_adaptation_notes:
      "For 14-15: stay concrete. Avoid abstract theology; tie back to daily decisions they actually make.",
  };
}

function fakeUsageResult(toolInput: unknown): AgentCallResult<unknown> {
  return {
    response: {
      id: "msg_test",
      type: "message",
      role: "assistant",
      model: "claude-sonnet-4-5",
      content: [
        {
          type: "tool_use",
          id: "tu_1",
          name: "emit_lesson_plan",
          input: toolInput,
        },
      ],
      stop_reason: "tool_use",
      stop_sequence: null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- reason: test fixture
    } as any,
    toolInput,
    usage: {
      inputTokens: 400,
      outputTokens: 900,
      cacheCreationTokens: 80,
      cacheReadTokens: 0,
      latencyMs: 4321,
    },
  };
}

function makeInput(
  overrides: Partial<RunLessonPlannerInput> = {},
): RunLessonPlannerInput {
  return {
    context: {
      unit: { quorum_class: "Teachers Quorum" },
      members: [makeMember()],
      recent_lessons: [],
      teacher_context: null,
    },
    caller: {
      userId: "00000000-0000-0000-0000-000000000001",
      unitId: "00000000-0000-0000-0000-000000000010",
    },
    manual_reference: "Jacob 4:14",
    lesson_date: "2026-05-31",
    mode: "standard",
    age_band: "14-15",
    ...overrides,
  };
}

const mockedWithUsage = vi.mocked(withUsage);

beforeEach(() => {
  mockedWithUsage.mockReset();
  process.env.RALLY_USAGE_HASH_SALT = "test-salt";
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// ---------------------------------------------------------------------------

describe("resolveTier", () => {
  it("returns 'default' when mode is 'standard' regardless of flag", () => {
    vi.stubEnv("RALLY_FLAG_LESSON_PLANNER_DEEP", "true");
    expect(resolveTier("standard")).toBe("default");
  });

  it("returns 'deep' when mode='deep' AND flag='true'", () => {
    vi.stubEnv("RALLY_FLAG_LESSON_PLANNER_DEEP", "true");
    expect(resolveTier("deep")).toBe("deep");
  });

  it("returns 'default' when mode='deep' but flag is unset", () => {
    vi.stubEnv("RALLY_FLAG_LESSON_PLANNER_DEEP", "");
    expect(resolveTier("deep")).toBe("default");
  });

  it("returns 'default' when mode='deep' but flag is 'false'", () => {
    vi.stubEnv("RALLY_FLAG_LESSON_PLANNER_DEEP", "false");
    expect(resolveTier("deep")).toBe("default");
  });
});

describe("runLessonPlanner — tier wired through to withUsage", () => {
  it("standard mode with flag on → withUsage called with tier='default'", async () => {
    vi.stubEnv("RALLY_FLAG_LESSON_PLANNER_DEEP", "true");
    mockedWithUsage.mockResolvedValueOnce(fakeUsageResult(validToolInput()));

    const result = await runLessonPlanner(makeInput({ mode: "standard" }));

    expect(mockedWithUsage).toHaveBeenCalledTimes(1);
    expect(mockedWithUsage.mock.calls[0]![0].tier).toBe("default");
    expect(result.tier).toBe("default");
  });

  it("deep mode with flag on → withUsage called with tier='deep'", async () => {
    vi.stubEnv("RALLY_FLAG_LESSON_PLANNER_DEEP", "true");
    mockedWithUsage.mockResolvedValueOnce(fakeUsageResult(validToolInput()));

    const result = await runLessonPlanner(makeInput({ mode: "deep" }));

    expect(mockedWithUsage.mock.calls[0]![0].tier).toBe("deep");
    expect(result.tier).toBe("deep");
  });

  it("deep mode with flag off → withUsage called with tier='default' (caller asks, flag denies)", async () => {
    vi.stubEnv("RALLY_FLAG_LESSON_PLANNER_DEEP", "false");
    mockedWithUsage.mockResolvedValueOnce(fakeUsageResult(validToolInput()));

    const result = await runLessonPlanner(makeInput({ mode: "deep" }));

    expect(mockedWithUsage.mock.calls[0]![0].tier).toBe("default");
    expect(result.tier).toBe("default");
  });
});

describe("runLessonPlanner — forced tool use + parsed output", () => {
  it("forces the emit_lesson_plan tool and returns the parsed output", async () => {
    mockedWithUsage.mockResolvedValueOnce(fakeUsageResult(validToolInput()));

    const result = await runLessonPlanner(makeInput());

    const call = mockedWithUsage.mock.calls[0]![0];
    expect(call.agentName).toBe("lesson_planner");
    expect(call.toolChoice).toEqual({
      type: "tool",
      name: "emit_lesson_plan",
    });
    expect(call.tools).toBeDefined();
    expect(
      call.tools!.some(
        (t) => (t as { name: string }).name === "emit_lesson_plan",
      ),
    ).toBe(true);

    expect(result.output.title).toBe("Looking Beyond the Mark");
    expect(result.output.outline).toHaveLength(3);
    expect(result.usage.outputTokens).toBe(900);
  });

  it("throws 'did not return structured output' when toolInput is null", async () => {
    const noTool: AgentCallResult<unknown> = {
      ...fakeUsageResult(null),
      toolInput: null,
    };
    mockedWithUsage.mockResolvedValueOnce(noTool);

    await expect(runLessonPlanner(makeInput())).rejects.toThrow(
      "did not return structured output",
    );
  });

  it("throws 'invalid output shape' when toolInput fails schema validation", async () => {
    const bad = {
      ...validToolInput(),
      outline: [validToolInput().outline[0]], // only 1 section, schema requires 3+
    };
    mockedWithUsage.mockResolvedValueOnce(fakeUsageResult(bad));

    await expect(runLessonPlanner(makeInput())).rejects.toThrow(
      "invalid output shape",
    );
  });

  it("user message does NOT contain raw last names from input members", async () => {
    mockedWithUsage.mockResolvedValueOnce(fakeUsageResult(validToolInput()));

    await runLessonPlanner(
      makeInput({
        context: {
          unit: { quorum_class: "Teachers Quorum" },
          members: [makeMember({ last_name: "Zygmuntowicz" })],
          recent_lessons: [],
          teacher_context: null,
        },
      }),
    );

    const userMessage = mockedWithUsage.mock.calls[0]![0].messages[0];
    const content =
      typeof userMessage?.content === "string"
        ? userMessage.content
        : JSON.stringify(userMessage?.content);
    expect(content).not.toContain("Zygmuntowicz");
  });
});
