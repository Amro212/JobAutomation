import { z } from 'zod';

export const discoveryScheduleRecordSchema = z.object({
  id: z.string().min(1),
  cronExpression: z.string().min(1),
  timezone: z.string().min(1),
  enabled: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date()
});

export const discoveryScheduleUpdateSchema = discoveryScheduleRecordSchema
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true
  })
  .partial()
  .refine(
    (value) => Object.keys(value).length > 0,
    'At least one field must be provided when updating a discovery schedule.'
  );

export type DiscoveryScheduleRecord = z.infer<typeof discoveryScheduleRecordSchema>;
export type DiscoveryScheduleUpdate = z.infer<typeof discoveryScheduleUpdateSchema>;