// lib/anthropic/withUsage.ts
//
// Wraps Anthropic's messages.create with usage logging. Agents call
// this; they never import @anthropic-ai/sdk directly.
//
// Schema notes (verified against migration 0001_initial_schema):
//   * usage_events.unit_id is nullable (migration 0003 dropped NOT NULL).
//     Rows are always written; null unit_id means a system-level call
//     (batch job, smoke test, ops tooling).
//   * request_hash is NOT NULL: we store SHA-256 of the prompt body,
//     never the body itself.
//   * redaction_summary is NOT NULL with default '{}'; we omit it from
//     the insert so the DB default applies. A future agent layer can
//     pass through structured redaction counts.
//   * The column is `error_code` (text, nullable), not `error_kind`.
//     Internally we use the same string codes; on insert we map.
//   * No `success` column; success is implied by error_code IS NULL.

import { createHash } from "node:crypto";

import type Anthropic from "@anthropic-ai/sdk";

import { createAdminClient } from "@/lib/supabase/admin";
import { log } from "@/lib/log";
import { getAnthropicClient } from "./client";
import { modelFor } from "./models";
import type {
  AgentCallInput,
  AgentCallResult,
  AgentCallUsage,
} from "./types";

/**
 * Hash a user identity for usage accounting without storing the raw
 * user_id. Bucketed per UTC day so the same user appears as the same
 * hash within a day, but a different hash across days — limits long-
 * term correlation while keeping daily-cost-per-user analytics
 * possible.
 */
function hashUserIdentity(args: {
  userId: string;
  unitId: string | null;
  date: Date;
}): string {
  const salt = process.env.RALLY_USAGE_HASH_SALT;
  if (!salt) {
    throw new Error(
      "RALLY_USAGE_HASH_SALT is not set. Cannot hash user identity.",
    );
  }
  const dayBucket = args.date.toISOString().slice(0, 10);
  const input = `${args.userId}|${args.unitId ?? "null"}|${dayBucket}|${salt}`;
  return createHash("sha256").update(input).digest("hex");
}

/**
 * SHA-256 of the prompt body. The body itself never persists; just
 * its hash, so we can correlate identical calls without leaking
 * content.
 */
function hashRequest(input: AgentCallInput, model: string): string {
  const body = JSON.stringify({
    model,
    system: input.system,
    messages: input.messages,
    tools: input.tools ?? null,
    toolChoice: input.toolChoice ?? null,
    maxTokens: input.maxTokens ?? 1024,
    temperature: input.temperature ?? 0.7,
  });
  return createHash("sha256").update(body).digest("hex");
}

function classifyError(err: unknown): string {
  if (!err || typeof err !== "object") return "unknown";
  const e = err as { status?: number; name?: string };
  if (e.status === 401) return "auth";
  if (e.status === 429) return "rate_limit";
  if (e.status === 400) return "bad_request";
  if (e.status && e.status >= 500) return "server_error";
  if (e.name === "AbortError") return "aborted";
  return "unknown";
}

function extractUsage(
  response: Anthropic.Messages.Message | null,
): Omit<AgentCallUsage, "latencyMs"> {
  if (!response) {
    return {
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
    };
  }
  const u = response.usage;
  return {
    inputTokens: u?.input_tokens ?? 0,
    outputTokens: u?.output_tokens ?? 0,
    cacheCreationTokens: u?.cache_creation_input_tokens ?? 0,
    cacheReadTokens: u?.cache_read_input_tokens ?? 0,
  };
}

function extractToolInput<T>(
  response: Anthropic.Messages.Message,
): T | null {
  for (const block of response.content) {
    if (block.type === "tool_use") {
      return block.input as T;
    }
  }
  return null;
}

async function writeUsageEvent(args: {
  agentName: string;
  model: string;
  userId: string;
  unitId: string | null;
  requestHash: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  latencyMs: number;
  errorCode: string | null;
}): Promise<void> {
  const userHash = hashUserIdentity({
    userId: args.userId,
    unitId: args.unitId,
    date: new Date(),
  });

  // The admin client is the right tool here:
  //   1. The hash already anonymises per-user data; RLS on raw user_id
  //      isn't meaningful.
  //   2. Some agent calls run from worker contexts without a request-
  //      bound supabase client.
  //   3. CLAUDE.md restricts admin client to workers/ and api/admin/;
  //      lib/anthropic/ is treated as worker-side infrastructure
  //      (documented in the Decisions Log).
  const supabase = createAdminClient();
  // unit_id is intentionally null for system-level calls. The generated types
  // still reflect the old NOT NULL constraint; migration 0003 drops it and
  // types.ts will be regenerated after the migration runs in CI.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- reason: generated types lag the migration
  const { error } = await supabase.from("usage_events").insert({
    unit_id: args.unitId as any, // reason: column is nullable post-migration 0003; types regenerated in CI
    user_hash: userHash,
    agent_name: args.agentName,
    model: args.model,
    input_tokens: args.inputTokens,
    output_tokens: args.outputTokens,
    cache_creation_tokens: args.cacheCreationTokens,
    cache_read_tokens: args.cacheReadTokens,
    latency_ms: args.latencyMs,
    request_hash: args.requestHash,
    error_code: args.errorCode,
    // redaction_summary omitted; DB default '{}'.
  });
  if (error) {
    // Preserve PostgrestError context (code, details) on the thrown
    // Error so the outer .catch can surface it through the structured
    // log and the dead-letter payload.
    const wrapped: Error & { code?: string; details?: string } = new Error(
      `usage_events insert failed: ${error.message}`,
    );
    if (error.code) wrapped.code = error.code;
    if (error.details) wrapped.details = error.details;
    throw wrapped;
  }
}

/**
 * Best-effort dead-letter write. Called only in production when the
 * primary usage_events insert fails. Never throws to the caller — if
 * the dead-letter insert itself fails, we log and move on. The dead-
 * letter table has no RLS policies; only the service role can write.
 */
async function writeDeadLetter(args: {
  agentName: string;
  model: string;
  unitId: string | null;
  userId: string;
  payload: Record<string, unknown>;
  originalError: unknown;
}): Promise<void> {
  try {
    const supabase = createAdminClient();
    const err = args.originalError as {
      message?: string;
      code?: string;
      details?: string;
    } | null;
    const { error } = await supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- reason: usage_events_failed lands in supabase/types.ts after migration 0004 runs in CI
      .from("usage_events_failed" as any)
      .insert({
        agent_name: args.agentName,
        model: args.model,
        unit_id: args.unitId,
        user_id_raw: args.userId,
        payload: args.payload,
        error_message:
          err?.message ??
          (args.originalError instanceof Error
            ? args.originalError.message
            : String(args.originalError)),
        error_code: err?.code ?? null,
        error_details: err?.details ?? null,
      });
    if (error) {
      log.error({
        event: "dead_letter_insert_failed",
        agent: args.agentName,
        err: error.message,
      });
    }
  } catch (err) {
    log.error({
      event: "dead_letter_threw",
      agent: args.agentName,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Wrap an Anthropic messages.create call with usage logging.
 *
 *   - Resolves the model via the tier registry.
 *   - Calls the SDK with sane defaults.
 *   - On success or failure, writes a row to usage_events.
 *   - Extracts tool input if a tool was forced (the agent pattern).
 *
 * Agents call this. They never import @anthropic-ai/sdk directly.
 */
export async function withUsage<T = unknown>(
  input: AgentCallInput,
): Promise<AgentCallResult<T>> {
  const client = getAnthropicClient();
  const model = modelFor(input.tier);
  const requestHash = hashRequest(input, model);
  const startedAt = Date.now();

  let response: Anthropic.Messages.Message | null = null;
  let errorCode: string | null = null;
  let errorThrown: unknown = null;

  try {
    response = await client.messages.create({
      model,
      max_tokens: input.maxTokens ?? 1024,
      temperature: input.temperature ?? 0.7,
      system: input.system,
      messages: input.messages,
      ...(input.tools ? { tools: input.tools } : {}),
      ...(input.toolChoice ? { tool_choice: input.toolChoice } : {}),
    });
  } catch (err) {
    errorThrown = err;
    errorCode = classifyError(err);
  }

  const latencyMs = Date.now() - startedAt;
  const usage = extractUsage(response);

  if (!input.skipUsageLogging) {
    await writeUsageEvent({
      agentName: input.agentName,
      model,
      userId: input.context.userId,
      unitId: input.context.unitId,
      requestHash,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cacheCreationTokens: usage.cacheCreationTokens,
      cacheReadTokens: usage.cacheReadTokens,
      latencyMs,
      errorCode,
    }).catch((err) => {
      // Telemetry failures must surface. Structured-log everywhere;
      // rethrow in non-prod so dev/test/CI fail loudly; in prod, write
      // to the usage_events_failed dead-letter so we have a queryable
      // signal. The user-facing agent call still completes.
      const e = err as {
        message?: string;
        name?: string;
        code?: string;
        details?: string;
      };
      log.error({
        event: "write_usage_event_failed",
        agent: input.agentName,
        model,
        err_message: e?.message ?? String(err),
        err_name: e?.name ?? null,
        supabase_code: e?.code ?? null,
        supabase_details: e?.details ?? null,
      });

      if (process.env.NODE_ENV !== "production") {
        throw err;
      }

      // Production: dead-letter so we have a queryable signal.
      void writeDeadLetter({
        agentName: input.agentName,
        model,
        unitId: input.context.unitId,
        userId: input.context.userId,
        payload: {
          agent_name: input.agentName,
          model,
          unit_id: input.context.unitId,
          input_tokens: usage.inputTokens,
          output_tokens: usage.outputTokens,
          cache_creation_tokens: usage.cacheCreationTokens,
          cache_read_tokens: usage.cacheReadTokens,
          latency_ms: latencyMs,
          request_hash: requestHash,
          error_code: errorCode,
        },
        originalError: err,
      });
    });
  }

  if (errorThrown) {
    throw errorThrown;
  }

  return {
    response: response!,
    toolInput: extractToolInput<T>(response!),
    usage: { ...usage, latencyMs },
  };
}

// Re-exported for tests only.
export const _internal = {
  hashUserIdentity,
  hashRequest,
  classifyError,
  extractUsage,
  extractToolInput,
};
