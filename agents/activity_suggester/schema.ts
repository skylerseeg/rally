import { z } from 'zod'

// Match the activity_category enum in supabase/migrations — do not add values here.
export const activityCategoryValues = [
  'spiritual',
  'service',
  'social',
  'physical',
  'skill',
] as const

export const activityCategorySchema = z.enum(activityCategoryValues)
export type ActivityCategory = z.infer<typeof activityCategorySchema>

export const suggestionSchema = z.object({
  title: z.string().trim().min(3).max(120),
  category: activityCategorySchema,
  description: z.string().trim().min(20).max(800),
  prep_checklist: z.array(z.string().trim().min(3).max(280)).max(8).default([]),
  supply_list: z.array(z.string().trim().min(2).max(200)).max(12).default([]),
  age_note: z.string().trim().max(280).optional(),
  faith_framing: z.string().trim().max(280).optional(),
  estimated_cost_usd: z.number().int().min(0).max(500),
  duration_minutes: z.number().int().min(15).max(480),
})

export const suggesterOutputSchema = z.object({
  suggestions: z.array(suggestionSchema).min(3).max(7),
  rationale: z.string().trim().min(10).max(800),
})

export type Suggestion = z.infer<typeof suggestionSchema>
export type SuggesterOutput = z.infer<typeof suggesterOutputSchema>

export const suggestActivitiesTool = {
  name: 'suggest_activities',
  description:
    'Return 3–7 activity suggestions tailored to the quorum context provided. ' +
    'Aim for a mix across categories (spiritual, service, social, physical, skill). ' +
    'Lean low-cost. Do not repeat anything from the recent_activities list.',
  input_schema: {
    type: 'object',
    properties: {
      suggestions: {
        type: 'array',
        minItems: 3,
        maxItems: 7,
        items: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            category: { type: 'string', enum: [...activityCategoryValues] },
            description: { type: 'string' },
            prep_checklist: { type: 'array', items: { type: 'string' }, maxItems: 8 },
            supply_list: { type: 'array', items: { type: 'string' }, maxItems: 12 },
            age_note: { type: 'string' },
            faith_framing: { type: 'string' },
            estimated_cost_usd: { type: 'integer', minimum: 0, maximum: 500 },
            duration_minutes: { type: 'integer', minimum: 15, maximum: 480 },
          },
          required: ['title', 'category', 'description', 'estimated_cost_usd', 'duration_minutes'],
        },
      },
      rationale: { type: 'string' },
    },
    required: ['suggestions', 'rationale'],
  },
} as const
