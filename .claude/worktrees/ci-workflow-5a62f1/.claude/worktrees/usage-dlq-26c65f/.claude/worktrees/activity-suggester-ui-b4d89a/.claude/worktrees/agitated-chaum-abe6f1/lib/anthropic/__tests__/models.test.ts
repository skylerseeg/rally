// lib/anthropic/__tests__/models.test.ts

import { describe, expect, it } from "vitest";

import { estimateCostUsd, modelFor } from "@/lib/anthropic/models";

describe("modelFor", () => {
  it("returns non-empty strings for every tier", () => {
    expect(modelFor("cheap")).toMatch(/.+/);
    expect(modelFor("default")).toMatch(/.+/);
    expect(modelFor("deep")).toMatch(/.+/);
  });

  it("returns distinct model strings per tier", () => {
    const set = new Set([
      modelFor("cheap"),
      modelFor("default"),
      modelFor("deep"),
    ]);
    expect(set.size).toBe(3);
  });
});

describe("estimateCostUsd", () => {
  it("returns a sane non-zero number for known models", () => {
    const cost = estimateCostUsd({
      model: modelFor("default"),
      inputTokens: 1_000,
      outputTokens: 500,
    });
    expect(cost).toBeGreaterThan(0);
    // 1k input + 500 output at sonnet rates = ~$0.0105; bound loosely.
    expect(cost).toBeLessThan(1);
  });

  it("includes cache create + read tokens in the total", () => {
    const base = estimateCostUsd({
      model: modelFor("default"),
      inputTokens: 1_000,
      outputTokens: 500,
    });
    const withCache = estimateCostUsd({
      model: modelFor("default"),
      inputTokens: 1_000,
      outputTokens: 500,
      cacheCreationTokens: 1_000,
      cacheReadTokens: 1_000,
    });
    expect(withCache).toBeGreaterThan(base);
  });

  it("returns 0 for an unknown model (graceful degradation)", () => {
    expect(
      estimateCostUsd({
        model: "claude-future-9",
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
      }),
    ).toBe(0);
  });
});
