// app/(app)/lessons/plan/__tests__/actions.test.ts
//
// Mirrors the activity_suggester actions test: happy path, refusal,
// schema error (typed + string-match), rate limit (typed + status=429),
// unauthorized, validation. Mocks the agent + auth + Supabase.

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---- Mocks (hoisted) ------------------------------------------------------

vi.mock("@/agents/lesson_planner", () => ({
  runLessonPlanner: vi.fn(),
}));

vi.mock("@/lib/auth/guards", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/auth/guards")>(
      "@/lib/auth/guards",
    );
  return {
    ...actual,
    requireLeader: vi.fn(),
    requireUnitAccess: vi.fn(),
  };
});

vi.mock("@/lib/auth/units", () => ({
  getActiveUnit: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/lesson-planner", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/lesson-planner")>(
      "@/lib/lesson-planner",
    );
  return {
    ...actual,
    getRecentLessons: vi.fn().mockResolvedValue([]),
  };
});

// ---- Imports under test ---------------------------------------------------

import { runLessonPlanner } from "@/agents/lesson_planner";
import { requireLeader, requireUnitAccess } from "@/lib/auth/guards";
import { getActiveUnit } from "@/lib/auth/units";
import {
  AgentRateLimitError,
  AgentRefusalError,
  AgentSchemaError,
  AuthorizationError,
} from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

import { generatePlan } from "../actions";

const mockedRun = vi.mocked(runLessonPlanner);
const mockedRequireLeader = vi.mocked(requireLeader);
const mockedRequireUnitAccess = vi.mocked(requireUnitAccess);
const mockedGetActiveUnit = vi.mocked(getActiveUnit);
const mockedCreateClient = vi.mocked(createClient);

const FAKE_USER_ID = "f47ac10b-58cc-4372-a567-0e02b2c3d479";
const FAKE_UNIT_ID = "00000000-0000-4000-8000-000000000010";
const FAKE_SUGGESTION_ID = "00000000-0000-4000-8000-0000000000aa";

function makeSupabaseMock(overrides?: {
  insertResult?: {
    data: { id: string } | null;
    error: { message: string } | null;
  };
}) {
  const insertResult =
    overrides?.insertResult ?? {
      data: { id: FAKE_SUGGESTION_ID },
      error: null,
    };
  return {
    from(table: string) {
      if (table === "members") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => Promise.resolve({ data: [], error: null }),
            }),
          }),
        };
      }
      if (table === "agent_suggestions") {
        return {
          insert: () => ({
            select: () => ({
              single: () => Promise.resolve(insertResult),
            }),
          }),
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  };
}

function makeAgentSuccess() {
  return {
    output: {
      title: "Looking Beyond the Mark",
      scripture_focus: ["Jacob 4:14"],
      themes: ["Centering on Christ", "Avoiding distraction"],
      opening_question:
        "What's something you've been told to do that didn't make sense at the time?",
      outline: [
        {
          section_title: "What does it mean to 'look beyond the mark'?",
          duration_minutes: 8,
          discussion_questions: ["Examples today?"],
          teaching_notes:
            "Open with Jacob 4:14. Have someone read aloud and paraphrase.",
          scripture_or_quote: "Jacob 4:14",
        },
        {
          section_title: "Application",
          duration_minutes: 14,
          discussion_questions: ["How do good things distract from best?"],
          teaching_notes:
            "List good-but-not-best activities. Compare busy vs. faithful.",
          scripture_or_quote: null,
        },
        {
          section_title: "Center on Christ",
          duration_minutes: 13,
          discussion_questions: ["What practices keep Christ central?"],
          teaching_notes: "Share a brief refocus story. Invite voluntary sharing.",
          scripture_or_quote: null,
        },
      ],
      closing_invitation:
        "Pick one practice this week that helps you center on Christ.",
      teacher_prep_notes:
        "Read Jacob 4:14 and Helaman 12:1-3. Think about a refocus moment. Bring scripture markers.",
      age_adaptation_notes:
        "For 14-15: stay concrete; avoid abstract theology.",
    },
    tier: "default" as const,
    usage: {
      inputTokens: 400,
      outputTokens: 900,
      cacheCreationTokens: 80,
      cacheReadTokens: 0,
      latencyMs: 4321,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();

  mockedRequireLeader.mockResolvedValue({
    user: { id: FAKE_USER_ID } as never,
    memberships: [],
  });
  mockedGetActiveUnit.mockResolvedValue({
    unit: { id: FAKE_UNIT_ID, name: "Test Ward" } as never,
    role: "leader" as never,
    calling_title: null,
  });
  mockedRequireUnitAccess.mockResolvedValue({} as never);
  mockedCreateClient.mockResolvedValue(makeSupabaseMock() as never);
});

// ---------------------------------------------------------------------------

describe("generatePlan", () => {
  it("happy path returns ok=true with the plan and a suggestion_id", async () => {
    mockedRun.mockResolvedValueOnce(makeAgentSuccess());

    const result = await generatePlan({
      manual_reference: "Jacob 4:14",
      lesson_date: "2026-05-31",
      mode: "standard",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.suggestion_id).toBe(FAKE_SUGGESTION_ID);
      expect(result.lesson_date).toBe("2026-05-31");
      expect(result.manual_reference).toBe("Jacob 4:14");
      expect(result.tier).toBe("default");
      expect(result.plan.outline).toHaveLength(3);
    }
  });

  it("returns kind='refusal' when the agent throws AgentRefusalError", async () => {
    mockedRun.mockRejectedValueOnce(new AgentRefusalError("refused"));
    const result = await generatePlan({
      manual_reference: "Jacob 4:14",
      lesson_date: "2026-05-31",
      mode: "standard",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe("refusal");
  });

  it("returns kind='schema' when the agent throws AgentSchemaError", async () => {
    mockedRun.mockRejectedValueOnce(new AgentSchemaError("bad shape"));
    const result = await generatePlan({
      manual_reference: "Jacob 4:14",
      lesson_date: "2026-05-31",
      mode: "standard",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe("schema");
  });

  it("returns kind='schema' on the string-matched 'did not return structured output'", async () => {
    mockedRun.mockRejectedValueOnce(
      new Error("lesson_planner did not return structured output"),
    );
    const result = await generatePlan({
      manual_reference: "Jacob 4:14",
      lesson_date: "2026-05-31",
      mode: "standard",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe("schema");
  });

  it("returns kind='rate_limit' when the agent throws AgentRateLimitError", async () => {
    mockedRun.mockRejectedValueOnce(new AgentRateLimitError("slow down"));
    const result = await generatePlan({
      manual_reference: "Jacob 4:14",
      lesson_date: "2026-05-31",
      mode: "standard",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe("rate_limit");
  });

  it("returns kind='rate_limit' when the SDK throws with status=429", async () => {
    const sdkErr = Object.assign(new Error("rate limited"), { status: 429 });
    mockedRun.mockRejectedValueOnce(sdkErr);
    const result = await generatePlan({
      manual_reference: "Jacob 4:14",
      lesson_date: "2026-05-31",
      mode: "standard",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe("rate_limit");
  });

  it("returns kind='unauthorized' when requireLeader throws AuthorizationError", async () => {
    mockedRequireLeader.mockRejectedValueOnce(
      new AuthorizationError("no memberships"),
    );
    const result = await generatePlan({
      manual_reference: "Jacob 4:14",
      lesson_date: "2026-05-31",
      mode: "standard",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe("unauthorized");
    expect(mockedRun).not.toHaveBeenCalled();
  });

  it("returns kind='validation' on malformed lesson_date and never calls the agent", async () => {
    const result = await generatePlan({
      manual_reference: "Jacob 4:14",
      lesson_date: "not-a-date" as never,
      mode: "standard",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe("validation");
    expect(mockedRun).not.toHaveBeenCalled();
  });
});
