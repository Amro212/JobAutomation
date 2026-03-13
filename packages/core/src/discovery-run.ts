import { z } from 'zod';

import { discoveryRunStatusSchema } from './status';

export const discoveryRunRecordSchema = z.object({
  id: z.string().min(1),
  sourceKind: z.string().min(1),
  status: discoveryRunStatusSchema,
  startedAt: z.date(),
  completedAt: z.date().nullable(),
  jobCount: z.number().int().nonnegative(),
  newJobCount: z.number().int().nonnegative(),
  updatedJobCount: z.number().int().nonnegative(),
  errorMessage: z.string().nullable()
});

export type DiscoveryRunRecord = z.infer<typeof discoveryRunRecordSchema>;
