// lib/anthropic/__tests__/withUsage.test.ts

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---- Mocks (hoisted) ------------------------------------------------------

const { messagesCreateMock, insertMock, fromMock } = vi.hoisted(() => ({
  messagesCreateMock: vi.fn(),
  insertMock: vi.fn(),
  fromMock: vi.fn(),
}));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class MockAnthropic {
    messages = { create: messagesCreateMock };
    constructor(_opts?: unknown) {}
  },
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: fromMock }),
}));

// ---- Imports under test (after vi.mock so the mocks resolve) --------------

import { _internal, withUsage } from "@/lib/anthropic/withUsage";
import { _resetAnthropicClientForTest } from "@/lib/anthropic/client";
import type { AgentCallInput } from "@/lib/anthropic/types";

// ---- Fixtures -------------------------------------------------------------

function fakeMessage(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-sonnet-4-5",
    content: [
      {
        type: "tool_use",
        id: "tu_1",
        name: "emit_test",
        input: { foo: "bar" },
      },
    ],
    stop_reason: "tool_use",
    stop_sequence: null,
    usage: {
      input_tokens: 100,
      output_tokens: 50,
      cache_creation_input_tokens: 10,
      cache_read_input_tokens: 20,
    },
    ...overrides,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

function makeInput(
  overrides: Partial<AgentCallInput> = {},
): AgentCallInput {
  return {
    agentName: "test_agent",
    tier: "default",
    system: [{ type: "text", text: "you are a test" }],
    messages: [{ role: "user", content: "hi" }],
    context: {
      userId: "00000000-0000-0000-0000-000000000001",
      unitId: "00000000-0000-0000-0000-000000000010",
    },
    ...overrides,
  };
}

beforeEach(() => {
  process.env.RALLY_USAGE_HASH_SALT = "test-salt";
  process.env.ANTHROPIC_API_KEY = "test-key";
  _resetAnthropicClientForTest();
  messagesCreateMock.mockReset();
  insertMock.mockReset();
  fromMock.mockReset();
  fromMock.mockReturnValue({ insert: insertMock });
  insertMock.mockResolvedValue({ error: null });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---- _internal helpers ----------------------------------------------------

describe("hashUserIdentity", () => {
  it("is deterministic for same inputs same day, different across days, throws without salt", () => {
    const a1 = _internal.hashUserIdentity({
      userId: "u",
      unitId: "v",
      date: new Date("2026-05-07T12:00:00Z"),
    });
    const a2 = _internal.hashUserIdentity({
      userId: "u",
      unitId: "v",
      date: new Date("2026-05-07T23:59:59Z"),
    });
    const b = _internal.hashUserIdentity({
      userId: "u",
      unitId: "v",
      date: new Date("2026-05-08T00:00:00Z"),
    });
    expect(a1).toBe(a2);
    expect(a1).not.toBe(b);

    delete process.env.RALLY_USAGE_HASH_SALT;
    expect(() =>
      _internal.hashUserIdentity({
        userId: "u",
        unitId: "v",
        date: new Date(),
      }),
    ).toThrow(/RALLY_USAGE_HASH_SALT/);
  });
});

describe("classifyError", () => {
  it("maps known statuses and falls back to 'unknown'", () => {
    expect(_internal.classifyError({ status: 401 })).toBe("auth");
    expect(_internal.classifyError({ status: 429 })).toBe("rate_limit");
    expect(_internal.classifyError({ status: 400 })).toBe("bad_request");
    expect(_internal.classifyError({ status: 502 })).toBe("server_error");
    expect(_internal.classifyError({ name: "AbortError" })).toBe("aborted");
    expect(_internal.classifyError(null)).toBe("unknown");
    expect(_internal.classifyError("string")).toBe("unknown");
    expect(_internal.classifyError({ status: 418 })).toBe("unknown");
  });
});

describe("extractToolInput", () => {
  it("returns the tool_use input when present, null otherwise", () => {
    const withTool = fakeMessage();
    expect(_internal.extractToolInput(withTool)).toEqual({ foo: "bar" });

    const noTool = fakeMessage({
      content: [{ type: "text", text: "hello" }],
    });
    expect(_internal.extractToolInput(noTool)).toBeNull();
  });
});

describe("extractUsage", () => {
  it("handles missing cache fields gracefully", () => {
    const partial = fakeMessage({
      usage: { input_tokens: 7, output_tokens: 3 },
    });
    expect(_internal.extractUsage(partial)).toEqual({
      inputTokens: 7,
      outputTokens: 3,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
    });
  });
});

// ---- withUsage end-to-end -------------------------------------------------

describe("withUsage — happy path", () => {
  it("returns toolInput and writes one usage_events row", async () => {
    messagesCreateMock.mockResolvedValueOnce(fakeMessage());

    const result = await withUsage<{ foo: string }>(makeInput());

    expect(result.toolInput).toEqual({ foo: "bar" });
    expect(result.usage.inputTokens).toBe(100);
    expect(result.usage.outputTokens).toBe(50);
    expect(result.usage.cacheCreationTokens).toBe(10);
    expect(result.usage.cacheReadTokens).toBe(20);
    expect(typeof result.usage.latencyMs).toBe("number");

    expect(fromMock).toHaveBeenCalledWith("usage_events");
    expect(insertMock).toHaveBeenCalledTimes(1);
    const row = insertMock.mock.calls[0]![0];
    expect(row).toMatchObject({
      unit_id: "00000000-0000-0000-0000-000000000010",
      agent_name: "test_agent",
      input_tokens: 100,
      output_tokens: 50,
      cache_creation_tokens: 10,
      cache_read_tokens: 20,
      error_code: null,
    });
    expect(row.user_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.request_hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("withUsage — error path", () => {
  it("re-throws but still logs error_code='rate_limit'", async () => {
    const err = Object.assign(new Error("rate limited"), { status: 429 });
    messagesCreateMock.mockRejectedValueOnce(err);

    await expect(withUsage(makeInput())).rejects.toThrow("rate limited");

    expect(insertMock).toHaveBeenCalledTimes(1);
    const row = insertMock.mock.calls[0]![0];
    expect(row.error_code).toBe("rate_limit");
    expect(row.input_tokens).toBe(0);
    expect(row.output_tokens).toBe(0);
  });
});

describe("withUsage — skipUsageLogging", () => {
  it("does not call the admin insert when skipUsageLogging is true", async () => {
    messagesCreateMock.mockResolvedValueOnce(fakeMessage());
    await withUsage(makeInput({ skipUsageLogging: true }));
    expect(insertMock).not.toHaveBeenCalled();
  });
});

describe("withUsage — non-fatal logging failure (production)", () => {
  it("returns the agent result even if usage_events insert errors", async () => {
    // The swallow-in-prod contract only applies when NODE_ENV is
    // 'production' — outside prod we rethrow so dev/test/CI catch the
    // failure. See Decisions Log entry 2026-05-10.
    vi.stubEnv("NODE_ENV", "production");
    messagesCreateMock.mockResolvedValueOnce(fakeMessage());
    insertMock.mockResolvedValueOnce({
      error: { message: "DB blew up" },
    });

    const result = await withUsage<{ foo: string }>(makeInput());
    expect(result.toolInput).toEqual({ foo: "bar" });

    vi.unstubAllEnvs();
  });
});

describe("withUsage — null unitId (system-level calls)", () => {
  it("writes the usage_events row with unit_id: null and returns response", async () => {
    messagesCreateMock.mockResolvedValueOnce(fakeMessage());

    const result = await withUsage<{ foo: string }>(
      makeInput({ context: { userId: "00000000-0000-0000-0000-000000000001", unitId: null } }),
    );

    expect(result.toolInput).toEqual({ foo: "bar" });
    expect(fromMock).toHaveBeenCalledWith("usage_events");
    expect(insertMock).toHaveBeenCalledTimes(1);
    const row = insertMock.mock.calls[0]![0];
    expect(row).toMatchObject({
      unit_id: null,
      agent_name: "test_agent",
      error_code: null,
    });
    expect(row.user_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("writes the usage_events row with error_code set when the API throws with unitId: null", async () => {
    const err = Object.assign(new Error("overloaded"), { status: 429 });
    messagesCreateMock.mockRejectedValueOnce(err);

    await expect(
      withUsage(
        makeInput({ context: { userId: "00000000-0000-0000-0000-000000000001", unitId: null } }),
      ),
    ).rejects.toThrow("overloaded");

    expect(insertMock).toHaveBeenCalledTimes(1);
    const row = insertMock.mock.calls[0]![0];
    expect(row.unit_id).toBeNull();
    expect(row.error_code).toBe("rate_limit");
    expect(row.input_tokens).toBe(0);
    expect(row.output_tokens).toBe(0);
  });
});
