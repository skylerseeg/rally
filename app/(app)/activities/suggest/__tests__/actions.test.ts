import { beforeEach, describe, expect, it, vi } from "vitest";

// Mocks must be hoisted before imports under test.

vi.mock("@/agents/activity_suggester", () => ({
  runActivitySuggester: vi.fn(),
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

vi.mock("next/navigation", () => ({
  // useThisSuggestion ends with redirect(); throw a recognisable sentinel
  // so the test can assert the action completed without bailing the suite.
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

import { runActivitySuggester } from "@/agents/activity_suggester";
import { requireLeader, requireUnitAccess } from "@/lib/auth/guards";
import { getActiveUnit } from "@/lib/auth/units";
import {
  AgentRateLimitError,
  AgentRefusalError,
  AgentSchemaError,
  AuthorizationError,
} from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

import { generateSuggestions, useThisSuggestion } from "../actions";

const mockedRunAgent = vi.mocked(runActivitySuggester);
const mockedRequireLeader = vi.mocked(requireLeader);
const mockedRequireUnitAccess = vi.mocked(requireUnitAccess);
const mockedGetActiveUnit = vi.mocked(getActiveUnit);
const mockedCreateClient = vi.mocked(createClient);

const FAKE_USER_ID = "00000000-0000-0000-0000-000000000001";
const FAKE_UNIT_ID = "00000000-0000-0000-0000-000000000010";
const FAKE_SUGGESTION_ID = "00000000-0000-0000-0000-0000000000aa";

function makeSupabaseMock(overrides?: {
  insertResult?: { data: { id: string } | null; error: { message: string } | null };
}) {
  const insertResult =
    overrides?.insertResult ??
    { data: { id: FAKE_SUGGESTION_ID }, error: null };

  // Chainable builders. Each `.from(table)` returns a fresh chain whose
  // terminal methods resolve to canned data.
  return {
    from(table: string) {
      if (table === "activities") {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () => Promise.resolve({ data: [], error: null }),
              }),
            }),
          }),
        };
      }
      if (table === "attendance") {
        return {
          select: () => ({
            in: () => Promise.resolve({ data: [], error: null }),
          }),
        };
      }
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
      suggestions: [
        {
          title: "Capture the flag",
          category: "physical" as const,
          description:
            "Classic team game with glow sticks after dark. Low cost, high energy for the whole quorum.",
          prep_checklist: [],
          supply_list: ["glow sticks"],
          estimated_cost_usd: 10,
          duration_minutes: 60,
        },
        {
          title: "Yard cleanup service",
          category: "service" as const,
          description:
            "Rake leaves and tidy up the yard of an elderly ward member. Simple supplies, big impact.",
          prep_checklist: [],
          supply_list: [],
          estimated_cost_usd: 0,
          duration_minutes: 90,
        },
        {
          title: "Dutch-oven night",
          category: "skill" as const,
          description:
            "Each team gets a dutch oven and a recipe. Cook dinner together outdoors and enjoy the results.",
          prep_checklist: [],
          supply_list: [],
          estimated_cost_usd: 25,
          duration_minutes: 120,
        },
      ],
      rationale: "Mix of low-cost activities suited to the quorum.",
    },
    usage: {
      inputTokens: 100,
      outputTokens: 200,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      latencyMs: 1234,
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

describe("generateSuggestions", () => {
  it("happy path returns ok=true with suggestions and a suggestion_id", async () => {
    mockedRunAgent.mockResolvedValueOnce(makeAgentSuccess());

    const result = await generateSuggestions({
      target_date: "2026-05-13",
      category: "any",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.suggestion_id).toBe(FAKE_SUGGESTION_ID);
      expect(result.target_date).toBe("2026-05-13");
      expect(result.suggestions).toHaveLength(3);
      expect(result.suggestions[0]!.title).toBe("Capture the flag");
    }
  });

  it("returns kind='refusal' when the agent throws AgentRefusalError", async () => {
    mockedRunAgent.mockRejectedValueOnce(new AgentRefusalError("refused"));

    const result = await generateSuggestions({
      target_date: "2026-05-13",
      category: "any",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe("refusal");
      expect(result.message).toMatch(/declined/i);
    }
  });

  it("returns kind='schema' when the agent throws AgentSchemaError", async () => {
    mockedRunAgent.mockRejectedValueOnce(new AgentSchemaError("bad shape"));

    const result = await generateSuggestions({
      target_date: "2026-05-13",
      category: "any",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe("schema");
    }
  });

  it("returns kind='schema' when the agent throws plain Error('did not return structured output')", async () => {
    mockedRunAgent.mockRejectedValueOnce(
      new Error("activity_suggester did not return structured output"),
    );

    const result = await generateSuggestions({
      target_date: "2026-05-13",
      category: "any",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe("schema");
    }
  });

  it("returns kind='rate_limit' when the agent throws AgentRateLimitError", async () => {
    mockedRunAgent.mockRejectedValueOnce(new AgentRateLimitError("slow down"));

    const result = await generateSuggestions({
      target_date: "2026-05-13",
      category: "any",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe("rate_limit");
    }
  });

  it("returns kind='rate_limit' when the SDK throws an error with status=429", async () => {
    const sdkErr = Object.assign(new Error("rate limited"), { status: 429 });
    mockedRunAgent.mockRejectedValueOnce(sdkErr);

    const result = await generateSuggestions({
      target_date: "2026-05-13",
      category: "any",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe("rate_limit");
    }
  });

  it("returns kind='unauthorized' when requireLeader throws AuthorizationError", async () => {
    mockedRequireLeader.mockRejectedValueOnce(
      new AuthorizationError("no memberships"),
    );

    const result = await generateSuggestions({
      target_date: "2026-05-13",
      category: "any",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe("unauthorized");
    }
    expect(mockedRunAgent).not.toHaveBeenCalled();
  });

  it("returns kind='validation' on a malformed target_date and never calls the agent", async () => {
    const result = await generateSuggestions({
      target_date: "not-a-date" as never,
      category: "any",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe("validation");
    }
    expect(mockedRunAgent).not.toHaveBeenCalled();
  });
});

describe("useThisSuggestion", () => {
  it("writes an audit_events row with the expected call shape", async () => {
    const auditInsertSpy = vi.fn().mockResolvedValue({ error: null });
    mockedCreateClient.mockResolvedValue({
      from(table: string) {
        if (table === "agent_suggestions") {
          return {
            select: () => ({
              eq: () => ({
                single: () =>
                  Promise.resolve({
                    data: {
                      id: FAKE_SUGGESTION_ID,
                      unit_id: FAKE_UNIT_ID,
                      output: {
                        suggestions: [
                          { title: "Capture the flag" },
                        ],
                      },
                    },
                    error: null,
                  }),
              }),
            }),
          };
        }
        if (table === "audit_events") {
          return { insert: auditInsertSpy };
        }
        throw new Error(`unexpected table: ${table}`);
      },
    } as never);

    const formData = new FormData();
    formData.set("suggestion_id", FAKE_SUGGESTION_ID);
    formData.set("index", "0");
    formData.set("target_date", "2026-06-03");

    // The action terminates with redirect(); the mock throws a sentinel.
    await expect(useThisSuggestion(formData)).rejects.toThrow(/^NEXT_REDIRECT:/);

    expect(auditInsertSpy).toHaveBeenCalledTimes(1);
    expect(auditInsertSpy).toHaveBeenCalledWith({
      unit_id: FAKE_UNIT_ID,
      actor_user_id: FAKE_USER_ID,
      action: "activity_suggestion_used",
      target_table: "agent_suggestions",
      target_id: FAKE_SUGGESTION_ID,
      metadata: { index: 0, title: "Capture the flag" },
    });
  });
});
