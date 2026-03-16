import type { DiscoverySourceRecord } from '@jobautomation/core';

import type { SourceAdapter, SourceAdapterContext } from '../../contracts/source-adapter';
import { normalizeJob } from '../../normalization/normalize-job';
import type { LeverJob } from './lever-types';

function deriveRemoteType(job: LeverJob): string {
  const remoteType = job.workplaceType.toLowerCase();
  if (remoteType.includes('remote')) {
    return 'remote';
  }

  const location = job.categories.location.toLowerCase();
  if (location.includes('remote')) {
    return 'remote';
  }

  if (remoteType.includes('hybrid') || location.includes('hybrid')) {
    return 'hybrid';
  }

  if (remoteType.includes('onsite') || remoteType.includes('on-site')) {
    return 'onsite';
  }

  return 'unknown';
}

export function createLeverAdapter(source: DiscoverySourceRecord): SourceAdapter<LeverJob> {
  return {
    sourceKind: 'lever',
    normalizeJob(sourceJob: LeverJob, context: SourceAdapterContext) {
      const sourceCreatedAt =
        typeof sourceJob.createdAt === 'number' ? new Date(sourceJob.createdAt) : undefined;

      return normalizeJob(
        {
          sourceKind: 'lever',
          sourceId: sourceJob.id,
          sourceUrl: sourceJob.hostedUrl,
          companyName: source.label,
          title: sourceJob.text,
          location: sourceJob.categories.location,
          remoteType: deriveRemoteType(sourceJob),
          employmentType: sourceJob.categories.commitment || null,
          compensationText: sourceJob.salaryDescription || null,
          descriptionText: sourceJob.descriptionPlain,
          rawPayload: sourceJob,
          discoveredAt: sourceCreatedAt,
          updatedAt: sourceCreatedAt
        },
        {
          capturedAt: context.capturedAt
        }
      );
    }
  };
}
