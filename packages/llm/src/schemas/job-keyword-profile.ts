/** OpenRouter json_schema (strict) for job keyword profile extraction. */
export const jobKeywordProfileJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['target_titles', 'positive_keywords', 'negative_keywords', 'seniority'],
  properties: {
    target_titles: {
      type: 'array',
      description:
        'Precision-first desired job-title phrases for realistic next-step roles at the applicant seniority.',
      items: { type: 'string' }
    },
    positive_keywords: {
      type: 'array',
      description:
        'Strong profile-defining skills, tools, domains, and abbreviations. Avoid broad generic keyword bloat.',
      items: { type: 'string' }
    },
    negative_keywords: {
      type: 'array',
      description: 'Terms in titles that indicate a poor role fit for this applicant.',
      items: { type: 'string' }
    },
    seniority: {
      type: 'string',
      enum: ['new_grad', 'junior', 'mid', 'senior', 'lead']
    }
  }
} as const;
