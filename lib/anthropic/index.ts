// lib/anthropic/index.ts
//
// Public surface for agents. Import from "@/lib/anthropic", not from
// sub-paths. Per the Decisions Log, agents never import
// @anthropic-ai/sdk directly.

export { withUsage } from "./withUsage";
export { modelFor, estimateCostUsd } from "./models";
export type {
  ModelTier,
  AgentCallInput,
  AgentCallResult,
  AgentCallUsage,
} from "./types";
