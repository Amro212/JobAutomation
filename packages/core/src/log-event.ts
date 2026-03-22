import { z } from 'zod';

import { logLevelSchema } from './status';

export const logEventRecordSchema = z.object({
  id: z.string().min(1),
  discoveryRunId: z.string().nullable().default(null),
  jobId: z.string().nullable().default(null),
  applicationRunId: z.string().nullable().default(null),
  level: logLevelSchema,
  message: z.string().min(1),
  detailsJson: z.string().nullable().default(null),
  createdAt: z.date()
});

export type LogEventRecord = z.infer<typeof logEventRecordSchema>;
