import { z } from 'zod';

import { sourceKindSchema } from '../types/source-kind';

export const normalizeJobInputSchema = z.object({
  sourceKind: sourceKindSchema,
  sourceId: z.string().min(1),
  sourceUrl: z.string().url(),
  companyName: z.string().min(1),
  title: z.string().min(1),
  location: z.string().default(''),
  remoteType: z.string().default('unknown'),
  employmentType: z.string().min(1).nullish().transform((value) => value ?? null),
  compensationText: z.string().min(1).nullish().transform((value) => value ?? null),
  descriptionText: z.string().default(''),
  rawPayload: z.unknown().nullish().transform((value) => value ?? null),
  discoveredAt: z.coerce.date().optional(),
  updatedAt: z.coerce.date().optional()
});

export const normalizedJobSchema = normalizeJobInputSchema.extend({
  discoveredAt: z.date(),
  updatedAt: z.date()
});

export type NormalizeJobInput = z.input<typeof normalizeJobInputSchema>;
export type NormalizedJob = z.infer<typeof normalizedJobSchema>;
