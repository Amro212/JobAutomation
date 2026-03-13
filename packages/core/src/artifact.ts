import { z } from 'zod';

export const artifactRecordSchema = z.object({
  id: z.string().min(1),
  jobId: z.string().nullable(),
  discoveryRunId: z.string().nullable(),
  kind: z.string().min(1),
  format: z.string().min(1),
  fileName: z.string().min(1),
  storagePath: z.string().min(1),
  createdAt: z.date()
});

export type ArtifactRecord = z.infer<typeof artifactRecordSchema>;
