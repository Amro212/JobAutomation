import { z } from 'zod';

import { logLevelSchema } from './status';

export const logEventRecordSchema = z.object({
  id: z.string().min(1),
  discoveryRunId: z.string().nullable(),
  jobId: z.string().nullable(),
  level: logLevelSchema,
  message: z.string().min(1),
  detailsJson: z.string().nullable(),
  createdAt: z.date()
});

export type LogEventRecord = z.infer<typeof logEventRecordSchema>;