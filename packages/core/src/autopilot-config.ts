import { z } from 'zod';

import { jobListFiltersSchema } from './job';

export const autopilotApplySiteKeySchema = z.enum([
  'greenhouse',
  'lever',
  'ashby'
]);

export const autopilotArtifactModeSchema = z.enum(['both', 'resume', 'cover-letter']);

export const autopilotConfigSchema = z.object({
  discoverySourceIds: z.array(z.string().min(1)).default([]),
  applySiteKeys: z.array(autopilotApplySiteKeySchema).min(1).default([
    'greenhouse',
    'lever',
    'ashby'
  ]),
  maxJobsPerRun: z.number().int().min(1).max(100).nullable().default(null),
  matchProfile: z.enum(['me', 'all']).nullable().default(null),
  forceFreshDiscovery: z.boolean().default(false),
  discoveryCacheHours: z.number().int().min(0).max(72).default(3),
  artifactMode: autopilotArtifactModeSchema.default('both'),
  jobFilters: jobListFiltersSchema.partial().default({})
});

export const autopilotConfigInputSchema = autopilotConfigSchema.partial();

export const autopilotSettingsRecordSchema = z.object({
  id: z.string().min(1),
  config: autopilotConfigSchema,
  createdAt: z.date(),
  updatedAt: z.date()
});

export type AutopilotApplySiteKey = z.infer<typeof autopilotApplySiteKeySchema>;
export type AutopilotArtifactMode = z.infer<typeof autopilotArtifactModeSchema>;
export type AutopilotConfig = z.infer<typeof autopilotConfigSchema>;
export type AutopilotConfigInput = z.infer<typeof autopilotConfigInputSchema>;
export type AutopilotSettingsRecord = z.infer<typeof autopilotSettingsRecordSchema>;
