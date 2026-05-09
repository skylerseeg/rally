import { describe, it, expect } from 'vitest'
import {
  suggesterOutputSchema,
  suggestActivitiesTool,
  activityCategorySchema,
  activityCategoryValues,
} from '../schema'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSuggestion(overrides: Record<string, unknown> = {}) {
  return {
    title: 'Capture the flag at the church field',
    category: 'physical',
    description: 'Classic team game with glow sticks after dark. Low cost, high energy.',
    prep_checklist: ['Buy glow sticks', 'Mark the field boundary'],
    supply_list: ['Glow sticks', 'Two flags', 'Cones'],
    estimated_cost_usd: 10,
    duration_minutes: 60,
    ...overrides,
  }
}

function makeValidPayload(count = 5) {
  return {
    suggestions: Array.from({ length: count }, (_, i) =>
      makeSuggestion({ title: `Activity suggestion ${i + 1}` }),
    ),
    rationale:
      'Varied mix of low-cost weekly and service activities suited to the group.',
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('suggesterOutputSchema', () => {
  it('parses a canonical valid 5-suggestion payload', () => {
    const result = suggesterOutputSchema.safeParse(makeValidPayload(5))
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.suggestions).toHaveLength(5)
    }
  })

  it('rejects a 2-suggestion payload (violates min(3))', () => {
    const result = suggesterOutputSchema.safeParse(makeValidPayload(2))
    expect(result.success).toBe(false)
  })

  it('rejects estimated_cost_usd: -5', () => {
    const payload = makeValidPayload(3)
    payload.suggestions[0] = makeSuggestion({ estimated_cost_usd: -5 }) as ReturnType<
      typeof makeSuggestion
    >
    const result = suggesterOutputSchema.safeParse(payload)
    expect(result.success).toBe(false)
  })

  it('rejects duration_minutes: 600 (max is 480)', () => {
    const payload = makeValidPayload(3)
    payload.suggestions[0] = makeSuggestion({ duration_minutes: 600 }) as ReturnType<
      typeof makeSuggestion
    >
    const result = suggesterOutputSchema.safeParse(payload)
    expect(result.success).toBe(false)
  })

  it('rejects rationale: "ok" (min(10))', () => {
    const payload = { ...makeValidPayload(3), rationale: 'ok' }
    const result = suggesterOutputSchema.safeParse(payload)
    expect(result.success).toBe(false)
  })

  it('rejects category: "weekly" (old vocabulary rejected)', () => {
    const payload = makeValidPayload(3)
    payload.suggestions[0] = makeSuggestion({ category: 'weekly' }) as ReturnType<
      typeof makeSuggestion
    >
    const result = suggesterOutputSchema.safeParse(payload)
    expect(result.success).toBe(false)
  })
})

describe('activityCategorySchema', () => {
  it.each(activityCategoryValues)('parses "%s" as a valid category', (value) => {
    const result = activityCategorySchema.safeParse(value)
    expect(result.success).toBe(true)
  })

  it('rejects old value "outing"', () => {
    expect(activityCategorySchema.safeParse('outing').success).toBe(false)
  })

  it('rejects old value "activity"', () => {
    expect(activityCategorySchema.safeParse('activity').success).toBe(false)
  })

  it('rejects old value "weekly"', () => {
    expect(activityCategorySchema.safeParse('weekly').success).toBe(false)
  })
})

describe('suggestActivitiesTool', () => {
  it('input_schema.required includes suggestions and rationale', () => {
    const required = suggestActivitiesTool.input_schema.required
    expect(required).toContain('suggestions')
    expect(required).toContain('rationale')
  })

  it('item required fields include "category" not "kind"', () => {
    const itemRequired =
      suggestActivitiesTool.input_schema.properties.suggestions.items.required
    expect(itemRequired).toContain('category')
    expect(itemRequired).not.toContain('kind')
  })

  it('category enum in tool schema contains DB values', () => {
    const categoryEnum =
      suggestActivitiesTool.input_schema.properties.suggestions.items.properties.category.enum
    expect(categoryEnum).toEqual(expect.arrayContaining(['spiritual', 'service', 'social', 'physical', 'skill']))
  })
})
