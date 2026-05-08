// lib/anthropic/types.ts
//
// Shared types for the Anthropic foundation. Agents import the public
// surface (ModelTier, AgentCallInput, AgentCallResult) via "@/lib/anthropic".

import type Anthropic from "@anthropic-ai/sdk";

/**
 * Capability tiers. Agents request a tier, not a model string.
 * This lets us upgrade models in one place when Anthropic ships new ones.
 */
export type ModelTier = "cheap" | "default" | "deep";

/**
 * Standard input shape for any Rally agent call. The agent layer wraps
 * Anthropic's messages.create with these defaults plus structured output
 * via tool_choice.
 *
 * Callers MUST redact sensitive context before passing into this layer.
 * `lib/redact.ts` is the canonical pre-step.
 */
export type AgentCallInput = {
  /** Stable agent identifier — must match the directory name in agents/ */
  agentName: string;
  /** Capability tier; resolves to a concrete model in models.ts */
  tier: ModelTier;
  /**
   * System prompt content blocks. ALWAYS use cache_control: 'ephemeral'
   * for the static portion so prompt caching kicks in across calls.
   */
  system: Anthropic.Messages.TextBlockParam[];
  /** User-turn messages, already redacted by the caller. */
  messages: Anthropic.Messages.MessageParam[];
  /**
   * Tools — agents that need structured output define a single tool
   * whose input_schema mirrors the OutputSchema and force it via
   * toolChoice.
   */
  tools?: Anthropic.Messages.Tool[];
  /** Force a specific tool for structured output. */
  toolChoice?: Anthropic.Messages.ToolChoice;
  /** Max output tokens. Default 1024. */
  maxTokens?: number;
  /** Sampling. Default 0.7 for planning; lower for extraction. */
  temperature?: number;
  /**
   * Required for usage accounting. unitId is null for system-level calls
   * (batch jobs, smoke tests, ops tooling). Application-level callers
   * (server actions, agent invocations from a request context) MUST pass
   * the active unit_id; null is reserved for genuinely unscoped operations.
   */
  context: {
    userId: string;
    unitId: string | null;
  };
  /** If true, skip writing to usage_events (only for tests). */
  skipUsageLogging?: boolean;
};

export type AgentCallUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  latencyMs: number;
};

export type AgentCallResult<T = unknown> = {
  /** The full Anthropic response object. */
  response: Anthropic.Messages.Message;
  /**
   * If the response invoked a tool, the parsed input. Caller is
   * responsible for type-narrowing (typically via OutputSchema.parse).
   */
  toolInput: T | null;
  /** Tokens this call consumed (already logged to usage_events). */
  usage: AgentCallUsage;
};
