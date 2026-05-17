// lib/anthropic/models.ts
//
// Model registry. Tiers map to concrete model strings.
//
// Update in this file ONLY. Never hardcode model strings in agents.
//
// Tier guidance:
//   cheap   — simple extraction, classification, short structured outputs.
//             Targets ~$0.001 per call.
//   default — most agent work: planning, reasoning over redacted context,
//             multi-step structured outputs.
//   deep    — hard reasoning, long context, behind a feature flag for
//             cost control.
//
// Last review: 2026-05-07

import type { ModelTier } from "./types";

const MODEL_BY_TIER: Record<ModelTier, string> = {
  cheap: "claude-haiku-4-5-20251001",
  default: "claude-sonnet-4-5",
  deep: "claude-opus-4-5",
};

export function modelFor(tier: ModelTier): string {
  return MODEL_BY_TIER[tier];
}

/**
 * Pricing snapshot for cost estimation. NOT used for billing — these
 * are Anthropic public prices as of last review. Refresh on model
 * changes. Per-million-token rates in USD.
 */
type Pricing = {
  inputPerMillion: number;
  cacheWritePerMillion: number;
  cacheReadPerMillion: number;
  outputPerMillion: number;
};

const PRICING: Record<string, Pricing> = {
  "claude-haiku-4-5-20251001": {
    inputPerMillion: 1.0,
    cacheWritePerMillion: 1.25,
    cacheReadPerMillion: 0.1,
    outputPerMillion: 5.0,
  },
  "claude-sonnet-4-5": {
    inputPerMillion: 3.0,
    cacheWritePerMillion: 3.75,
    cacheReadPerMillion: 0.3,
    outputPerMillion: 15.0,
  },
  "claude-opus-4-5": {
    inputPerMillion: 15.0,
    cacheWritePerMillion: 18.75,
    cacheReadPerMillion: 1.5,
    outputPerMillion: 75.0,
  },
};

export function estimateCostUsd(args: {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
}): number {
  const p = PRICING[args.model];
  if (!p) return 0;
  const cw = args.cacheCreationTokens ?? 0;
  const cr = args.cacheReadTokens ?? 0;
  const cost =
    (args.inputTokens / 1_000_000) * p.inputPerMillion +
    (args.outputTokens / 1_000_000) * p.outputPerMillion +
    (cw / 1_000_000) * p.cacheWritePerMillion +
    (cr / 1_000_000) * p.cacheReadPerMillion;
  // Round to 6-decimal precision (10^-6 USD).
  return Math.round(cost * 1_000_000) / 1_000_000;
}
