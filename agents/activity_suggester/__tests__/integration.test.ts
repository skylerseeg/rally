import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks — must be hoisted before imports under test
// ---------------------------------------------------------------------------

vi.mock('@/lib/anthropic', () => ({
  withUsage: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Imports under test (after vi.mock so mocks resolve)
// ---------------------------------------------------------------------------

import { withUsage } from '@/lib/anthropic'
import { runActivitySuggester, type RunActivitySuggesterInput } from '../index'
import type { Member } from '@/lib/redact'
import type { AgentCallResult } from '@/lib/anthropic'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMember(overrides: Partial<Member> = {}): Member {
  return {
    id: 'member-uuid-001',
    unit_id: 'unit-uuid-001',
    quorum_class: 'priests' as Member['quorum_class'],
    first_name: 'James',
    last_name: 'Morrison',
    preferred_name: null,
    birthdate: '2010-03-15',
    parent_contacts: null as unknown as Member['parent_contacts'],
    notes: null,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

function makeValidToolInput() {
  return {
    suggestions: [
      {
        title: 'Capture the flag at the church field',
        kind: 'weekly',
        description: 'Classic team game with glow sticks after dark. Low cost, high energy for the whole quorum.',
        estimated_cost_usd: 10,
        duration_minutes: 60,
      },
      {
        title: 'Yard cleanup service project',
        kind: 'service',
        description: 'Rake leaves and tidy up the yard of an elderly ward member. Simple supplies, big impact.',
        estimated_cost_usd: 0,
        duration_minutes: 90,
      },
      {
        title: 'Dutch-oven cooking night',
        kind: 'activity',
        description: 'Each team gets a dutch oven and a recipe. Cook dinner together outdoors and enjoy the results.',
        estimated_cost_usd: 25,
        duration_minutes: 120,
      },
      {
        title: 'Temple grounds walk and reflection',
        kind: 'outing',
        description: 'Drive to the nearest temple, walk the grounds, and share a brief devotional at the end.',
        estimated_cost_usd: 5,
        duration_minutes: 90,
      },
      {
        title: 'Board-game night',
        kind: 'weekly',
        description: 'Stations of group-friendly games — Codenames, Telestrations, Werewolf. Snacks included.',
        estimated_cost_usd: 15,
        duration_minutes: 75,
      },
    ],
    rationale: 'Varied mix of low-cost weekly and service activities suited to a priests quorum.',
  }
}

function fakeUsageResult(toolInput: unknown): AgentCallResult<unknown> {
  return {
    response: {
      id: 'msg_test',
      type: 'message',
      role: 'assistant',
      model: 'claude-sonnet-4-5',
      content: [
        { type: 'tool_use', id: 'tu_1', name: 'suggest_activities', input: toolInput },
      ],
      stop_reason: 'tool_use',
      stop_sequence: null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- reason: test fixture
    } as any,
    toolInput,
    usage: {
      inputTokens: 200,
      outputTokens: 600,
      cacheCreationTokens: 50,
      cacheReadTokens: 0,
      latencyMs: 1234,
    },
  }
}

function makeInput(overrides: Partial<RunActivitySuggesterInput> = {}): RunActivitySuggesterInput {
  return {
    context: {
      unit: { quorum_class: 'Priests Quorum' },
      members: [makeMember()],
      recent_activities: [],
      constraints: {},
    },
    caller: {
      userId: '00000000-0000-0000-0000-000000000001',
      unitId: '00000000-0000-0000-0000-000000000010',
    },
    ...overrides,
  }
}

const mockedWithUsage = vi.mocked(withUsage)

beforeEach(() => {
  mockedWithUsage.mockReset()
  process.env.RALLY_USAGE_HASH_SALT = 'test-salt'
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runActivitySuggester', () => {
  it('calls withUsage exactly once with correct agentName, tier, tools, toolChoice, and context.unitId', async () => {
    mockedWithUsage.mockResolvedValueOnce(fakeUsageResult(makeValidToolInput()))

    await runActivitySuggester(makeInput())

    expect(mockedWithUsage).toHaveBeenCalledTimes(1)
    const callArg = mockedWithUsage.mock.calls[0]![0]
    expect(callArg.agentName).toBe('activity_suggester')
    expect(callArg.tier).toBe('default')
    expect(callArg.tools).toBeDefined()
    expect(callArg.tools!.some((t) => (t as { name: string }).name === 'suggest_activities')).toBe(true)
    expect(callArg.toolChoice).toEqual({ type: 'tool', name: 'suggest_activities' })
    expect(callArg.context.unitId).toBe('00000000-0000-0000-0000-000000000010')
  })

  it('returns the parsed output when withUsage returns valid toolInput', async () => {
    const toolInput = makeValidToolInput()
    mockedWithUsage.mockResolvedValueOnce(fakeUsageResult(toolInput))

    const result = await runActivitySuggester(makeInput())

    expect(result.output.suggestions).toHaveLength(5)
    expect(result.output.rationale).toContain('Varied mix')
    expect(result.usage.inputTokens).toBe(200)
  })

  it('throws containing "did not return structured output" when toolInput is null', async () => {
    const resultWithNoTool: AgentCallResult<unknown> = {
      ...fakeUsageResult(null),
      toolInput: null,
    }
    mockedWithUsage.mockResolvedValueOnce(resultWithNoTool)

    await expect(runActivitySuggester(makeInput())).rejects.toThrow(
      'did not return structured output',
    )
  })

  it('throws containing "invalid output shape" when toolInput fails validation (only 1 suggestion)', async () => {
    const badToolInput = {
      suggestions: [makeValidToolInput().suggestions[0]],
      rationale: 'Only one suggestion, should fail validation.',
    }
    mockedWithUsage.mockResolvedValueOnce(fakeUsageResult(badToolInput))

    await expect(runActivitySuggester(makeInput())).rejects.toThrow('invalid output shape')
  })

  it('user message does NOT contain raw last names from input members', async () => {
    mockedWithUsage.mockResolvedValueOnce(fakeUsageResult(makeValidToolInput()))

    await runActivitySuggester(
      makeInput({
        context: {
          unit: { quorum_class: 'Priests Quorum' },
          members: [makeMember({ last_name: 'Zygmuntowicz' })],
          recent_activities: [],
          constraints: {},
        },
      }),
    )

    const callArg = mockedWithUsage.mock.calls[0]![0]
    const userMessage = callArg.messages[0]
    const content =
      typeof userMessage?.content === 'string'
        ? userMessage.content
        : JSON.stringify(userMessage?.content)

    expect(content).not.toContain('Zygmuntowicz')
  })

  it('when recent_activities is empty, user message contains at least one title from activity_ideas.json', async () => {
    mockedWithUsage.mockResolvedValueOnce(fakeUsageResult(makeValidToolInput()))

    await runActivitySuggester(
      makeInput({
        context: {
          unit: { quorum_class: 'Priests Quorum' },
          members: [makeMember()],
          recent_activities: [],
          constraints: {},
        },
        seedCount: 12,
      }),
    )

    const callArg = mockedWithUsage.mock.calls[0]![0]
    const userMessage = callArg.messages[0]
    const content =
      typeof userMessage?.content === 'string'
        ? userMessage.content
        : JSON.stringify(userMessage?.content)

    // Load the actual catalog and verify at least one seed title appears in the message
    const catalog = await import('@/data/activity_ideas.json')
    const ideas = (catalog as { ideas: Array<{ title: string }> }).ideas
    const anyTitlePresent = ideas.some((idea) => content.includes(idea.title))
    expect(anyTitlePresent).toBe(true)
  })
})
