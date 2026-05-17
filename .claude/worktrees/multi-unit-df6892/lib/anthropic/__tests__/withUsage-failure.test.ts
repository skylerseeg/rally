// lib/anthropic/__tests__/withUsage-failure.test.ts
//
// Covers the new telemetry-failure contract introduced after P12:
//   * Non-prod (NODE_ENV !== 'production'): withUsage rethrows so
//     dev/test/CI surface telemetry failures loudly.
//   * Prod: withUsage swallows toward the caller but writes a row to
//     the usage_events_failed dead-letter table so we have a queryable
//     signal.
//   * Either way: the structured error log carries enough Supabase
//     error context (code, details) to diagnose the failure offline.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---- Mocks (hoisted) ------------------------------------------------------

const {
  messagesCreateMock,
  fromMock,
  usageInsertMock,
  dlqInsertMock,
  logErrorMock,
} = vi.hoisted(() => ({
  messagesCreateMock: vi.fn(),
  fromMock: vi.fn(),
  usageInsertMock: vi.fn(),
  dlqInsertMock: vi.fn(),
  logErrorMock: vi.fn(),
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

vi.mock("@/lib/log", () => ({
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    error: logErrorMock,
  },
}));

// ---- Imports under test (after vi.mock so the mocks resolve) --------------

import { withUsage } from "@/lib/anthropic/withUsage";
import { _resetAnthropicClientForTest } from "@/lib/anthropic/client";
import type { AgentCallInput } from "@/lib/anthropic/types";

// ---- Fixtures -------------------------------------------------------------

function fakeMessage() {
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

function makeInput(overrides: Partial<AgentCallInput> = {}): AgentCallInput {
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

const POSTGREST_ERR = {
  message: "permission denied for table usage_events",
  code: "42501",
  details: "service role lacks insert privilege on usage_events",
};

beforeEach(() => {
  process.env.RALLY_USAGE_HASH_SALT = "test-salt";
  process.env.ANTHROPIC_API_KEY = "test-key";
  _resetAnthropicClientForTest();

  messagesCreateMock.mockReset();
  fromMock.mockReset();
  usageInsertMock.mockReset();
  dlqInsertMock.mockReset();
  logErrorMock.mockReset();

  // Route .from(table) to per-table insert mocks so we can assert on
  // usage_events vs. usage_events_failed independently.
  fromMock.mockImplementation((table: string) => {
    if (table === "usage_events") return { insert: usageInsertMock };
    if (table === "usage_events_failed") return { insert: dlqInsertMock };
    throw new Error(`unexpected table: ${table}`);
  });
  dlqInsertMock.mockResolvedValue({ error: null });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------

describe("withUsage — telemetry failure surfacing", () => {
  it("rethrows the wrapped error in non-production (NODE_ENV='test')", async () => {
    // vitest's default NODE_ENV is 'test'; assert explicitly for clarity.
    vi.stubEnv("NODE_ENV", "test");
    messagesCreateMock.mockResolvedValueOnce(fakeMessage());
    usageInsertMock.mockResolvedValueOnce({ error: POSTGREST_ERR });

    await expect(withUsage(makeInput())).rejects.toThrow(
      /usage_events insert failed/,
    );

    // Dead-letter must NOT fire outside production — rethrow is the signal.
    expect(dlqInsertMock).not.toHaveBeenCalled();
  });

  it("does not throw in production; writes a row to usage_events_failed", async () => {
    vi.stubEnv("NODE_ENV", "production");
    messagesCreateMock.mockResolvedValueOnce(fakeMessage());
    usageInsertMock.mockResolvedValueOnce({ error: POSTGREST_ERR });

    const result = await withUsage<{ foo: string }>(makeInput());
    expect(result.toolInput).toEqual({ foo: "bar" });

    expect(dlqInsertMock).toHaveBeenCalledTimes(1);
    const dlqRow = dlqInsertMock.mock.calls[0]![0];
    expect(dlqRow).toMatchObject({
      agent_name: "test_agent",
      unit_id: "00000000-0000-0000-0000-000000000010",
      user_id_raw: "00000000-0000-0000-0000-000000000001",
      error_code: "42501",
      error_details: "service role lacks insert privilege on usage_events",
    });
    expect(dlqRow.error_message).toMatch(/usage_events insert failed/);
    expect(dlqRow.payload).toMatchObject({
      agent_name: "test_agent",
      input_tokens: 100,
      output_tokens: 50,
      cache_creation_tokens: 10,
      cache_read_tokens: 20,
    });
    expect(dlqRow.payload.request_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("emits a structured error log with err_message, supabase_code, supabase_details", async () => {
    vi.stubEnv("NODE_ENV", "production");
    messagesCreateMock.mockResolvedValueOnce(fakeMessage());
    usageInsertMock.mockResolvedValueOnce({ error: POSTGREST_ERR });

    await withUsage(makeInput());

    const writeFailedCalls = logErrorMock.mock.calls.filter(
      ([fields]) =>
        (fields as { event?: string }).event === "write_usage_event_failed",
    );
    expect(writeFailedCalls).toHaveLength(1);
    const fields = writeFailedCalls[0]![0] as Record<string, unknown>;
    expect(fields.agent).toBe("test_agent");
    expect(fields.err_message).toMatch(/usage_events insert failed/);
    expect(fields.supabase_code).toBe("42501");
    expect(fields.supabase_details).toBe(
      "service role lacks insert privilege on usage_events",
    );
  });

  it("in production, never throws even when the dead-letter insert also errors", async () => {
    vi.stubEnv("NODE_ENV", "production");
    messagesCreateMock.mockResolvedValueOnce(fakeMessage());
    usageInsertMock.mockResolvedValueOnce({ error: POSTGREST_ERR });
    dlqInsertMock.mockResolvedValueOnce({
      error: { message: "dead-letter also down" },
    });

    const result = await withUsage<{ foo: string }>(makeInput());
    expect(result.toolInput).toEqual({ foo: "bar" });

    // We should have at least one dead_letter_insert_failed log entry.
    // Flush the microtask queue so the awaited dlq insert resolves
    // and its error-log call lands before we assert.
    await Promise.resolve();
    await Promise.resolve();

    const dlqFailedCalls = logErrorMock.mock.calls.filter(
      ([fields]) =>
        (fields as { event?: string }).event === "dead_letter_insert_failed",
    );
    expect(dlqFailedCalls.length).toBeGreaterThanOrEqual(1);
  });
});
