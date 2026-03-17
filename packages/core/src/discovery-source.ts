import { z } from 'zod';

export const discoverySourceKindSchema = z.enum(['greenhouse', 'lever', 'ashby', 'playwright']);

export const discoverySourceRecordSchema = z.object({
  id: z.string().min(1),
  sourceKind: discoverySourceKindSchema,
  sourceKey: z.string().min(1),
  label: z.string().min(1),
  enabled: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date()
});

export const discoverySourceInputSchema = discoverySourceRecordSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

export const discoverySourcePatchSchema = discoverySourceInputSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  'At least one field must be provided when updating a discovery source.'
);

export type DiscoverySourceKind = z.infer<typeof discoverySourceKindSchema>;
export type DiscoverySourceRecord = z.infer<typeof discoverySourceRecordSchema>;
export type DiscoverySourceInput = z.infer<typeof discoverySourceInputSchema>;
export type DiscoverySourcePatch = z.infer<typeof discoverySourcePatchSchema>;
