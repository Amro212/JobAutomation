import type { NormalizedJob } from '../contracts/normalized-job';
import { normalizedJobSchema } from '../contracts/normalized-job';

function getIdentityKey(job: NormalizedJob): string {
  return `${job.sourceKind}:${job.sourceId}`;
}

function shouldReplace(existing: NormalizedJob, candidate: NormalizedJob): boolean {
  return candidate.updatedAt.getTime() >= existing.updatedAt.getTime();
}

export function dedupeJobs(jobs: readonly NormalizedJob[]): NormalizedJob[] {
  const deduped = new Map<string, NormalizedJob>();

  for (const job of jobs) {
    const normalized = normalizedJobSchema.parse(job);
    const key = getIdentityKey(normalized);
    const existing = deduped.get(key);

    if (!existing || shouldReplace(existing, normalized)) {
      deduped.set(key, normalized);
    }
  }

  return Array.from(deduped.values());
}
