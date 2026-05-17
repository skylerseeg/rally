// app/api/active-unit/__tests__/route.test.ts
//
// Covers the route handler that the UnitSwitcher posts to. Five
// branches: malformed JSON, missing/invalid unit_id, no access (403),
// happy path, unexpected error (500). Sticks to plain vitest + mocked
// deps; no testing-library, no real Supabase.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---- Mocks (hoisted) ------------------------------------------------------

const { requireUnitAccessMock, setActiveUnitMock, logErrorMock } = vi.hoisted(
  () => ({
    requireUnitAccessMock: vi.fn(),
    setActiveUnitMock: vi.fn(),
    logErrorMock: vi.fn(),
  }),
);

vi.mock("@/lib/auth/guards", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/auth/guards")>(
      "@/lib/auth/guards",
    );
  return {
    ...actual,
    requireUnitAccess: requireUnitAccessMock,
  };
});

vi.mock("@/lib/auth/units", () => ({
  setActiveUnit: setActiveUnitMock,
}));

vi.mock("@/lib/log", () => ({
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    error: logErrorMock,
  },
}));

// ---- Imports under test ---------------------------------------------------

import { POST } from "../route";
import { AuthorizationError, ValidationError } from "@/lib/errors";

// ---- Helpers --------------------------------------------------------------

// zod v4's z.uuid() enforces the RFC 4122 version+variant bits, so an
// "all zeros" placeholder won't pass. Use a real v4 UUID.
const VALID_UNIT_ID = "f47ac10b-58cc-4372-a567-0e02b2c3d479";

function jsonPost(body: unknown): Request {
  return new Request("http://localhost/api/active-unit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function rawPost(rawBody: string): Request {
  return new Request("http://localhost/api/active-unit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: rawBody,
  });
}

beforeEach(() => {
  requireUnitAccessMock.mockReset();
  setActiveUnitMock.mockReset();
  logErrorMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------

describe("POST /api/active-unit", () => {
  it("returns 400 when the body is not valid JSON", async () => {
    const res = await POST(rawPost("{not-json") as never);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Invalid JSON/i);
    expect(requireUnitAccessMock).not.toHaveBeenCalled();
    expect(setActiveUnitMock).not.toHaveBeenCalled();
  });

  it("returns 400 when unit_id is missing", async () => {
    const res = await POST(jsonPost({}) as never);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/uuid/i);
    expect(requireUnitAccessMock).not.toHaveBeenCalled();
  });

  it("returns 400 when unit_id is not a UUID", async () => {
    const res = await POST(jsonPost({ unit_id: "not-a-uuid" }) as never);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/uuid/i);
    expect(requireUnitAccessMock).not.toHaveBeenCalled();
  });

  it("returns 403 when the user has no access to the unit", async () => {
    requireUnitAccessMock.mockRejectedValueOnce(
      new AuthorizationError("not a member"),
    );

    const res = await POST(jsonPost({ unit_id: VALID_UNIT_ID }) as never);

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/access/i);
    expect(setActiveUnitMock).not.toHaveBeenCalled();
  });

  it("returns 200 and calls setActiveUnit on the happy path", async () => {
    requireUnitAccessMock.mockResolvedValueOnce({} as never);
    setActiveUnitMock.mockResolvedValueOnce(undefined as never);

    const res = await POST(jsonPost({ unit_id: VALID_UNIT_ID }) as never);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
    expect(requireUnitAccessMock).toHaveBeenCalledWith(VALID_UNIT_ID);
    expect(setActiveUnitMock).toHaveBeenCalledWith(VALID_UNIT_ID);
  });

  it("maps a ValidationError to 400 with the thrown message", async () => {
    requireUnitAccessMock.mockRejectedValueOnce(
      new ValidationError("custom validation failure"),
    );

    const res = await POST(jsonPost({ unit_id: VALID_UNIT_ID }) as never);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("custom validation failure");
  });

  it("returns 500 and logs when an unexpected error escapes", async () => {
    requireUnitAccessMock.mockRejectedValueOnce(new Error("DB on fire"));

    const res = await POST(jsonPost({ unit_id: VALID_UNIT_ID }) as never);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/internal/i);

    expect(logErrorMock).toHaveBeenCalledTimes(1);
    const fields = logErrorMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(fields.event).toBe("active_unit_set_failed");
  });
});
