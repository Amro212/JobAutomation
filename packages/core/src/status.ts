import { z } from 'zod';

export const jobStatusSchema = z.enum([
  'discovered',
  'reviewing',
  'shortlisted',
  'archived'
]);

export const discoveryRunStatusSchema = z.enum([
  'pending',
  'running',
  'completed',
  'partial',
  'failed'
]);

export const applicationRunStatusSchema = z.enum([
  'pending',
  'running',
  'paused',
  'skipped',
  'completed',
  'failed'
]);

export const applicationRunTypeSchema = z.enum([
  'greenhouse',
  'lever',
  'ashby',
  'playwright'
]);
export const applicationRunSiteKeySchema = applicationRunTypeSchema;

export const logLevelSchema = z.enum(['info', 'warn', 'error']);

export type JobStatus = z.infer<typeof jobStatusSchema>;
export type DiscoveryRunStatus = z.infer<typeof discoveryRunStatusSchema>;
export type ApplicationRunStatus = z.infer<typeof applicationRunStatusSchema>;
export type ApplicationRunType = z.infer<typeof applicationRunTypeSchema>;
export type LogLevel = z.infer<typeof logLevelSchema>;
