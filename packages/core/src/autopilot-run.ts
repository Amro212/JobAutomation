import { z } from 'zod';

import {
  autopilotRunStatusSchema,
  autopilotRunTriggerKindSchema
} from './status';

export const autopilotRunRecordSchema = z.object({
  id: z.string().min(1),
  triggerKind: autopilotRunTriggerKindSchema,
  status: autopilotRunStatusSchema,
  currentStep: z.string().min(1),
  discoveryRunId: z.string().min(1).nullable().default(null),
  discoveredJobCount: z.number().int().nonnegative(),
  eligibleJobCount: z.number().int().nonnegative(),
  skippedJobCount: z.number().int().nonnegative(),
  submittedCount: z.number().int().nonnegative(),
  blockedCount: z.number().int().nonnegative(),
  failedCount: z.number().int().nonnegative(),
  errorMessage: z.string().nullable().default(null),
  createdAt: z.date(),
  startedAt: z.date().nullable().default(null),
  completedAt: z.date().nullable().default(null),
  updatedAt: z.date()
});

export type AutopilotRunRecord = z.infer<typeof autopilotRunRecordSchema>;
