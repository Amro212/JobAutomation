import { z } from 'zod';

import { jobStatusSchema } from './status';

export const jobRecordSchema = z.object({
  id: z.string().min(1),
  sourceKind: z.string().min(1),
  sourceId: z.string().min(1),
  sourceUrl: z.string().url(),
  companyName: z.string().min(1),
  title: z.string().min(1),
  location: z.string().default(''),
  remoteType: z.string().default('unknown'),
  employmentType: z.string().nullable(),
  compensationText: z.string().nullable(),
  descriptionText: z.string().default(''),
  rawPayload: z.string().nullable(),
  discoveryRunId: z.string().nullable(),
  status: jobStatusSchema,
  discoveredAt: z.date(),
  updatedAt: z.date()
});

export type JobRecord = z.infer<typeof jobRecordSchema>;
