/** OpenRouter json_schema (strict) for job keyword profile extraction. */
export const jobKeywordProfileJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['target_titles', 'positive_keywords', 'negative_keywords', 'seniority'],
  properties: {
    target_titles: {
      type: 'array',
      items: { type: 'string' }
    },
    positive_keywords: {
      type: 'array',
      items: { type: 'string' }
    },
    negative_keywords: {
      type: 'array',
      items: { type: 'string' }
    },
    seniority: {
      type: 'string',
      enum: ['new_grad', 'junior', 'mid', 'senior', 'lead']
    }
  }
} as const;
