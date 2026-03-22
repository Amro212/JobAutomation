/** OpenRouter json_schema (strict) for job keyword profile extraction. */
export const jobKeywordProfileJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['target_titles', 'positive_keywords', 'negative_keywords', 'seniority'],
  properties: {
    target_titles: {
      type: 'array',
      description:
        'Many short phrases that may appear in desired job titles; prefer exhaustive synonyms and variants for high recall.',
      items: { type: 'string' }
    },
    positive_keywords: {
      type: 'array',
      description:
        'Many skills, tools, domains, and abbreviations that signal a good title match; err on the side of including more.',
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
