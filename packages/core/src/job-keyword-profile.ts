import { z } from 'zod';

export const jobKeywordSenioritySchema = z.enum(['new_grad', 'junior', 'mid', 'senior', 'lead']);

export type JobKeywordSeniority = z.infer<typeof jobKeywordSenioritySchema>;

/** LLM-generated filter profile (snake_case matches model JSON). */
export const jobKeywordProfileSchema = z.object({
  target_titles: z.array(z.string()),
  positive_keywords: z.array(z.string()),
  negative_keywords: z.array(z.string()),
  seniority: jobKeywordSenioritySchema
});

export type JobKeywordProfile = z.infer<typeof jobKeywordProfileSchema>;
