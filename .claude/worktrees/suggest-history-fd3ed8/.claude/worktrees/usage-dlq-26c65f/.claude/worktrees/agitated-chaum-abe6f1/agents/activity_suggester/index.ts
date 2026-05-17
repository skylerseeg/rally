// agents/activity_suggester/index.ts
//
// Entrypoint for the activity_suggester agent. Orchestrates redaction,
// prompt construction, the Anthropic call (via withUsage), and output
// validation. Never imports @anthropic-ai/sdk directly.

import type Anthropic from '@anthropic-ai/sdk'
import { withUsage } from '@/lib/anthropic'
import { log } from '@/lib/log'
import { suggesterOutputSchema, suggestActivitiesTool, type SuggesterOutput } from './schema'
import { redactForSuggester, type SuggesterContextInput } from './redact'
import { buildSystem, buildUserMessage } from './prompt'
import ideaCatalogRaw from '@/data/activity_ideas.json'

export type RunActivitySuggesterInput = {
  context: SuggesterContextInput
  caller: { userId: string; unitId: string }
  /** Number of idea-seeds from the catalog to include. Default 12. */
  seedCount?: number
}

export type RunActivitySuggesterResult = {
  output: SuggesterOutput
  usage: {
    inputTokens: number
    outputTokens: number
    cacheCreationTokens: number
    cacheReadTokens: number
    latencyMs: number
  }
}

type IdeaCatalog = {
  ideas: Array<{ title: string; category?: string; [key: string]: unknown }>
}

const ideaCatalog = ideaCatalogRaw as IdeaCatalog

export async function runActivitySuggester(
  input: RunActivitySuggesterInput,
): Promise<RunActivitySuggesterResult> {
  const redacted = redactForSuggester(input.context)
  const seeds = pickIdeaSeeds(
    input.seedCount ?? 12,
    redacted.recent_activities.map((a) => a.title),
  )

  const result = await withUsage<unknown>({
    agentName: 'activity_suggester',
    tier: 'default',
    system: buildSystem(),
    messages: [buildUserMessage(redacted, seeds)],
    tools: [suggestActivitiesTool as unknown as Anthropic.Messages.Tool],
    toolChoice: { type: 'tool', name: 'suggest_activities' },
    maxTokens: 2048,
    temperature: 0.8,
    context: { userId: input.caller.userId, unitId: input.caller.unitId },
  })

  if (!result.toolInput) {
    log.error({
      event: 'activity_suggester_no_tool_input',
      stop_reason: result.response.stop_reason,
    })
    throw new Error('activity_suggester did not return structured output')
  }

  const parsed = suggesterOutputSchema.safeParse(result.toolInput)
  if (!parsed.success) {
    log.error({
      event: 'activity_suggester_invalid_output',
      issues: parsed.error.flatten(),
    })
    throw new Error('activity_suggester returned invalid output shape')
  }

  return { output: parsed.data, usage: result.usage }
}

// TODO: Re-categorize data/activity_ideas.json entries to use activity_category
// values (spiritual | service | social | physical | skill) in a future pass.
// Currently the seed catalog uses a different taxonomy; only titles are used here.
function pickIdeaSeeds(count: number, exclude: string[]): string[] {
  const excludeSet = new Set(exclude.map((s) => s.toLowerCase().trim()))
  const eligible = ideaCatalog.ideas.filter(
    (c) => !excludeSet.has(c.title.toLowerCase().trim()),
  )
  const shuffled = [...eligible].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, count).map((c) => c.title)
}
