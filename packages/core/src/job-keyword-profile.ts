import { z } from 'zod';

export const jobKeywordSenioritySchema = z.enum(['new_grad', 'junior', 'mid', 'senior', 'lead']);

export type JobKeywordSeniority = z.infer<typeof jobKeywordSenioritySchema>;

export const jobMatchRoleFamilySchema = z.enum(['engineering']);

export type JobMatchRoleFamily = z.infer<typeof jobMatchRoleFamilySchema>;

/** LLM-generated filter profile (snake_case matches model JSON). */
export const jobKeywordProfileSchema = z.object({
  target_titles: z.array(z.string()),
  positive_keywords: z.array(z.string()),
  negative_keywords: z.array(z.string()),
  seniority: jobKeywordSenioritySchema,
  allowed_role_families: z.array(jobMatchRoleFamilySchema).default(['engineering']),
  must_have_keywords: z.array(z.string()).default([]),
  nice_to_have_keywords: z.array(z.string()).default([]),
  negative_role_terms: z.array(z.string()).default([]),
  max_required_years: z.number().int().min(0).max(20).nullable().default(null)
});

export type JobKeywordProfile = z.infer<typeof jobKeywordProfileSchema>;
