// lib/anthropic/client.ts
//
// Singleton Anthropic SDK client. Lazy-initialized so importing this
// module doesn't crash at build time when ANTHROPIC_API_KEY is unset
// (e.g. CI without secrets).
//
// Per the Decisions Log, this is the ONLY file in the repo allowed to
// instantiate `new Anthropic(...)`. Agents import withUsage() and let
// the foundation own the client lifecycle.

import Anthropic from "@anthropic-ai/sdk";

let _client: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Cannot create Anthropic client.",
    );
  }
  _client = new Anthropic({ apiKey });
  return _client;
}

/**
 * Test-only. Resets the cached client so a different mock can be
 * installed between tests. Do not call from production code.
 */
export function _resetAnthropicClientForTest(): void {
  _client = null;
}
