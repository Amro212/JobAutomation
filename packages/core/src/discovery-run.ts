import { z } from 'zod';

import { discoveryRunStatusSchema } from './status';

export const discoveryRunKindSchema = z.enum(['single-source', 'structured']);
export const discoveryRunTriggerKindSchema = z.enum(['manual', 'scheduled', 'retry']);

export const discoveryRunRecordSchema = z.object({
  id: z.string().min(1),
  sourceKind: z.string().min(1),
  runKind: discoveryRunKindSchema,
  triggerKind: discoveryRunTriggerKindSchema,
  discoverySourceId: z.string().nullable(),
  scheduleId: z.string().nullable(),
  status: discoveryRunStatusSchema,
  startedAt: z.date(),
  completedAt: z.date().nullable(),
  jobCount: z.number().int().nonnegative(),
  newJobCount: z.number().int().nonnegative(),
  updatedJobCount: z.number().int().nonnegative(),
  errorMessage: z.string().nullable()
});

export const discoveryRunSourceSummarySchema = z.object({
  discoverySourceId: z.string().nullable(),
  sourceKind: z.string().min(1),
  sourceKey: z.string().min(1),
  label: z.string().min(1),
  status: z.enum(['completed', 'failed', 'skipped']),
  jobCount: z.number().int().nonnegative(),
  newJobCount: z.number().int().nonnegative(),
  updatedJobCount: z.number().int().nonnegative(),
  errorMessage: z.string().nullable()
});

export type DiscoveryRunKind = z.infer<typeof discoveryRunKindSchema>;
export type DiscoveryRunTriggerKind = z.infer<typeof discoveryRunTriggerKindSchema>;
export type DiscoveryRunRecord = z.infer<typeof discoveryRunRecordSchema>;
export type DiscoveryRunSourceSummary = z.infer<typeof discoveryRunSourceSummarySchema>;
