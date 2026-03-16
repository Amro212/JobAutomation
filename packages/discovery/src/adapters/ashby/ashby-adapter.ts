import type { DiscoverySourceRecord } from '@jobautomation/core';

import type { SourceAdapter, SourceAdapterContext } from '../../contracts/source-adapter';
import { normalizeJob } from '../../normalization/normalize-job';
import type { AshbyJob } from './ashby-types';

function deriveRemoteType(job: AshbyJob): string {
  const workplaceType = job.workplaceType.toLowerCase();
  const location = job.location.toLowerCase();

  if (job.isRemote || workplaceType.includes('remote') || location.includes('remote')) {
    return 'remote';
  }

  if (workplaceType.includes('hybrid') || location.includes('hybrid')) {
    return 'hybrid';
  }

  if (
    workplaceType.includes('on-site') ||
    workplaceType.includes('onsite') ||
    workplaceType.includes('office')
  ) {
    return 'onsite';
  }

  return 'unknown';
}

function formatEmploymentType(value: string): string | null {
  if (value.trim() === '') {
    return null;
  }

  return value.replace(/([a-z])([A-Z])/g, '$1 $2').trim();
}

function extractCompensationText(job: AshbyJob): string | null {
  if (!job.shouldDisplayCompensationOnJobPostings) {
    return null;
  }

  const summary =
    job.compensation.compensationTierSummary || job.compensation.scrapeableCompensationSalarySummary;

  return summary.trim() === '' ? null : summary;
}

export function createAshbyAdapter(source: DiscoverySourceRecord): SourceAdapter<AshbyJob> {
  return {
    sourceKind: 'ashby',
    normalizeJob(sourceJob: AshbyJob, context: SourceAdapterContext) {
      return normalizeJob(
        {
          sourceKind: 'ashby',
          sourceId: sourceJob.id,
          sourceUrl: sourceJob.jobUrl,
          companyName: source.label,
          title: sourceJob.title,
          location: sourceJob.location,
          remoteType: deriveRemoteType(sourceJob),
          employmentType: formatEmploymentType(sourceJob.employmentType),
          compensationText: extractCompensationText(sourceJob),
          descriptionText: sourceJob.descriptionPlain || sourceJob.descriptionHtml,
          rawPayload: sourceJob,
          updatedAt: new Date(sourceJob.publishedAt)
        },
        {
          capturedAt: context.capturedAt
        }
      );
    }
  };
}
