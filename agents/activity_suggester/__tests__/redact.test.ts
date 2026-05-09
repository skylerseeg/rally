import { describe, it, expect } from 'vitest'
import { redactForSuggester, type SuggesterContextInput } from '../redact'
import { _assertNoNameAndDob } from '@/lib/redact'
import type { Member } from '@/lib/redact'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMember(overrides: Partial<Member> = {}): Member {
  return {
    id: 'member-uuid-001',
    unit_id: 'unit-uuid-001',
    quorum_class: 'priests' as Member['quorum_class'],
    first_name: 'James',
    last_name: 'Smith',
    preferred_name: null,
    birthdate: '2010-03-15', // ~16 years old as of 2026
    parent_contacts: null as unknown as Member['parent_contacts'],
    notes: null,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

function makeInput(overrides: Partial<SuggesterContextInput> = {}): SuggesterContextInput {
  return {
    unit: { quorum_class: 'Priests Quorum' },
    members: [makeMember()],
    recent_activities: [],
    constraints: {},
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('redactForSuggester', () => {
  it('member_summaries contain first_name only — no last_name, no birthdate string', () => {
    const result = redactForSuggester(makeInput())
    expect(result.audience.member_summaries).toHaveLength(1)
    const summary = result.audience.member_summaries[0]!

    // first_name present
    expect(summary.first_name).toBe('James')
    // No last_name key
    expect(Object.keys(summary)).not.toContain('last_name')
    // No birthdate string anywhere in the serialized output
    const serialized = JSON.stringify(summary)
    expect(serialized).not.toContain('2010-03-15')
    expect(serialized).not.toContain('Smith')
  })

  it('notes containing a phone number — notes_excerpt does NOT contain the phone number', () => {
    const memberWithPhone = makeMember({
      notes: { general: 'call 801-555-1234 for pickup arrangements' },
    })
    const result = redactForSuggester(makeInput({ members: [memberWithPhone] }))
    const summary = result.audience.member_summaries[0]!
    expect(summary.notes_excerpt).not.toContain('801-555-1234')
    expect(summary.notes_excerpt).toContain('[phone]')
  })

  it('_assertNoNameAndDob does not throw on each member_summary (regression check)', () => {
    const input = makeInput({
      members: [
        makeMember({ first_name: 'Alice', id: 'member-uuid-002' }),
        makeMember({ first_name: 'Bob', id: 'member-uuid-003' }),
      ],
    })
    const result = redactForSuggester(input)
    for (const summary of result.audience.member_summaries) {
      expect(() =>
        _assertNoNameAndDob(summary as unknown as Record<string, unknown>),
      ).not.toThrow()
    }
  })

  it('weeks_ago math: activity 14 days ago → weeks_ago === 2', () => {
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
    const input = makeInput({
      recent_activities: [
        {
          title: 'Basketball Night',
          category: 'physical',
          starts_at: fourteenDaysAgo,
          attendance_summary: null,
        },
      ],
    })
    const result = redactForSuggester(input)
    expect(result.recent_activities[0]!.weeks_ago).toBe(2)
  })

  it('attendance_rate: {present:8, absent:2, excused:1} → ~0.727', () => {
    const input = makeInput({
      recent_activities: [
        {
          title: 'Service Night',
          category: 'service',
          starts_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
          attendance_summary: { present: 8, absent: 2, excused: 1 },
        },
      ],
    })
    const result = redactForSuggester(input)
    const rate = result.recent_activities[0]!.attendance_rate
    expect(rate).not.toBeNull()
    expect(rate!).toBeCloseTo(8 / 11, 5)
  })

  it('attendance_summary: null → attendance_rate === null', () => {
    const input = makeInput({
      recent_activities: [
        {
          title: 'Game Night',
          category: 'social',
          starts_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
          attendance_summary: null,
        },
      ],
    })
    const result = redactForSuggester(input)
    expect(result.recent_activities[0]!.attendance_rate).toBeNull()
  })
})
