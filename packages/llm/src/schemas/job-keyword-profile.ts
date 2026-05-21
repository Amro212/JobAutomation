/** OpenRouter json_schema (strict) for job keyword profile extraction. */
export const jobKeywordProfileJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'target_titles',
    'positive_keywords',
    'negative_keywords',
    'seniority',
    'allowed_role_families',
    'must_have_keywords',
    'nice_to_have_keywords',
    'negative_role_terms',
    'max_required_years'
  ],
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
    },
    allowed_role_families: {
      type: 'array',
      description: 'Allowed role families for matching. For this product version use engineering only.',
      items: { type: 'string', enum: ['engineering'] }
    },
    must_have_keywords: {
      type: 'array',
      description: 'Skills or domains that should appear for a high-confidence match.',
      items: { type: 'string' }
    },
    nice_to_have_keywords: {
      type: 'array',
      description: 'Useful but non-required profile skills and domains.',
      items: { type: 'string' }
    },
    negative_role_terms: {
      type: 'array',
      description: 'Title or role-family terms that indicate wrong-track roles.',
      items: { type: 'string' }
    },
    max_required_years: {
      type: ['number', 'null'],
      description: 'Maximum explicit required years for automatic matching, or null to infer from seniority.'
    }
  }
} as const;
