import type { NormalizeJobInput, NormalizedJob } from '../contracts/normalized-job';
import { normalizedJobSchema, normalizeJobInputSchema } from '../contracts/normalized-job';

export type NormalizeJobOptions = {
  capturedAt?: Date;
};

export function normalizeJob(
  input: NormalizeJobInput,
  options: NormalizeJobOptions = {}
): NormalizedJob {
  const parsed = normalizeJobInputSchema.parse(input);
  const capturedAt = options.capturedAt ?? new Date();

  return normalizedJobSchema.parse({
    ...parsed,
    discoveredAt: parsed.discoveredAt ?? capturedAt,
    updatedAt: parsed.updatedAt ?? capturedAt
  });
}
