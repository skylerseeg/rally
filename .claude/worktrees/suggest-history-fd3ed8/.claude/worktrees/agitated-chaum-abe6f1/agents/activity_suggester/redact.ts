// agents/activity_suggester/redact.ts
//
// Domain-specific redaction for the activity_suggester agent.
// Composes lib/redact.ts primitives. The RedactedContext it produces
// is the ONLY thing that reaches prompt.ts — raw member data never
// touches the prompt layer.

import { redactMembers, scrubNotes } from '@/lib/redact'
import type { Member } from '@/lib/redact'

export type SuggesterContextInput = {
  unit: {
    quorum_class: string
  }
  members: Member[]
  recent_activities: Array<{
    title: string
    category: string
    starts_at: string
    attendance_summary: { present: number; absent: number; excused: number } | null
  }>
  constraints: {
    budget_usd?: number
    theme?: string
    season?: string
    avoid_kinds?: string[]
  }
}

export type RedactedContext = {
  audience: {
    quorum_class: string
    member_count: number
    ages: number[]
    member_summaries: Array<{
      first_name: string
      age_years: number
      notes_excerpt: string
    }>
  }
  recent_activities: Array<{
    title: string
    category: string
    weeks_ago: number
    attendance_rate: number | null
  }>
  constraints: SuggesterContextInput['constraints']
}

export function redactForSuggester(input: SuggesterContextInput): RedactedContext {
  // includeNotes: true so we can surface scrubbed context excerpts to the agent.
  const redactedMembers = redactMembers(input.members, { includeNotes: true })

  return {
    audience: {
      quorum_class: input.unit.quorum_class,
      member_count: redactedMembers.length,
      // age_years can be null when birthdate is missing; filter those out
      ages: redactedMembers
        .map((m) => m.age_years)
        .filter((a): a is number => a !== null),
      member_summaries: redactedMembers
        .filter((m) => m.age_years !== null)
        .map((m) => ({
          first_name: m.first_name,
          age_years: m.age_years as number,
          // notes field is { general: string } when includeNotes is true and present
          notes_excerpt: scrubNotes(m.notes?.general ?? '').slice(0, 200),
        })),
    },
    recent_activities: input.recent_activities.map((a) => {
      const weeksAgo = Math.floor(
        (Date.now() - new Date(a.starts_at).getTime()) / (7 * 24 * 60 * 60 * 1000),
      )
      const summary = a.attendance_summary
      const total = summary ? summary.present + summary.absent + summary.excused : 0
      return {
        title: a.title,
        category: a.category,
        weeks_ago: weeksAgo,
        attendance_rate: total > 0 ? summary!.present / total : null,
      }
    }),
    constraints: input.constraints,
  }
}
