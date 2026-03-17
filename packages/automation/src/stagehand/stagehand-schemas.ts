import { z } from 'zod';

export const stagehandExtractedJobSchema = z.object({
  sourceId: z.string().trim().min(1).nullish().transform((value) => value ?? null),
  sourceUrl: z.string().url(),
  companyName: z.string().trim().min(1),
  title: z.string().trim().min(1),
  location: z.string().trim().default(''),
  remoteType: z.string().trim().default('unknown'),
  employmentType: z.string().trim().min(1).nullish().transform((value) => value ?? null),
  compensationText: z.string().trim().min(1).nullish().transform((value) => value ?? null),
  descriptionText: z.string().trim().default('')
});

export type StagehandExtractedJob = z.infer<typeof stagehandExtractedJobSchema>;
