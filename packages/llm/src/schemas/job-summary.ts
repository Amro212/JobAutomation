import { z } from 'zod';

export const jobSummarySchema = z.object({
  summary: z.string().trim().min(1).max(1200),
  score: z.coerce.number().int().min(0).max(100),
  reasoning: z.string().trim().min(1).max(800).optional()
});

export type JobSummary = z.infer<typeof jobSummarySchema>;

export const jobSummaryJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'score'],
  properties: {
    summary: {
      type: 'string',
      minLength: 1,
      maxLength: 1200
    },
    score: {
      type: 'integer',
      minimum: 0,
      maximum: 100
    },
    reasoning: {
      type: 'string',
      minLength: 1,
      maxLength: 800
    }
  }
} as const;
