import { z } from 'zod';

import { prefilterReasonSchema } from './job-prefilter';
import { applicationRunStatusSchema, applicationRunTypeSchema } from './status';

export const applicationRunRecordSchema = z.object({
  id: z.string().min(1),
  jobId: z.string().min(1),
  siteKey: applicationRunTypeSchema,
  status: applicationRunStatusSchema,
  currentStep: z.string().min(1),
  stopReason: z.string().min(1).nullable().default(null),
  prefilterReasons: z.array(prefilterReasonSchema).default([]),
  reviewUrl: z.string().url().nullable().default(null),
  resumeArtifactId: z.string().min(1).nullable().default(null),
  coverLetterArtifactId: z.string().min(1).nullable().default(null),
  createdAt: z.date(),
  startedAt: z.date().nullable().default(null),
  completedAt: z.date().nullable().default(null),
  updatedAt: z.date()
});

export type ApplicationRunRecord = z.infer<typeof applicationRunRecordSchema>;
