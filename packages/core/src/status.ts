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
  'failed'
]);

export const applicationRunStatusSchema = z.enum([
  'pending',
  'running',
  'paused',
  'completed',
  'failed'
]);

export const logLevelSchema = z.enum(['info', 'warn', 'error']);

export type JobStatus = z.infer<typeof jobStatusSchema>;
export type DiscoveryRunStatus = z.infer<typeof discoveryRunStatusSchema>;
export type ApplicationRunStatus = z.infer<typeof applicationRunStatusSchema>;
export type LogLevel = z.infer<typeof logLevelSchema>;
