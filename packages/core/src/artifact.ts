import { z } from 'zod';

export const artifactRecordSchema = z.object({
  id: z.string().min(1),
  jobId: z.string().nullable(),
  discoveryRunId: z.string().nullable(),
  applicantProfileId: z.string().nullable().default(null),
  applicantProfileUpdatedAt: z.date().nullable().default(null),
  version: z.number().int().min(1).default(1),
  kind: z.string().min(1),
  format: z.string().min(1),
  fileName: z.string().min(1),
  storagePath: z.string().min(1),
  createdAt: z.date()
});

export type ArtifactRecord = z.infer<typeof artifactRecordSchema>;
