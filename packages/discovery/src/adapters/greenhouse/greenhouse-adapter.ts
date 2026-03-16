import type { DiscoverySourceRecord } from '@jobautomation/core';

import type { SourceAdapter, SourceAdapterContext } from '../../contracts/source-adapter';
import { normalizeJob } from '../../normalization/normalize-job';
import type { GreenhouseJob } from './greenhouse-types';

const genericGreenhouseTitlePatterns = [
  /^don['’]t see what you['’]?re looking for\??$/i,
  /^general application$/i,
  /^general interest$/i,
  /^future opportunities$/i,
  /^join our talent community$/i,
  /^talent pool$/i
];

export function filterGreenhouseJobs(jobs: readonly GreenhouseJob[]): GreenhouseJob[] {
  return jobs.filter(
    (job) =>
      !genericGreenhouseTitlePatterns.some((pattern) => pattern.test(job.title.trim()))
  );
}

function deriveRemoteType(job: GreenhouseJob): string {
  const haystack = `${job.location.name} ${job.title} ${job.content}`.toLowerCase();

  if (haystack.includes('hybrid')) {
    return 'hybrid';
  }

  if (haystack.includes('remote')) {
    return 'remote';
  }

  if (haystack.includes('on-site') || haystack.includes('onsite')) {
    return 'onsite';
  }

  return 'unknown';
}

function extractEmploymentType(job: GreenhouseJob): string | null {
  const employmentType = job.metadata.find((entry) =>
    entry.name.toLowerCase().includes('employment')
  );

  if (employmentType?.value == null || employmentType.value === '') {
    return null;
  }

  return String(employmentType.value);
}

function formatCurrencyAmount(valueInCents: number | undefined): string | null {
  if (valueInCents == null) {
    return null;
  }

  return (valueInCents / 100).toLocaleString('en-US', {
    maximumFractionDigits: 0
  });
}

function extractCompensationText(job: GreenhouseJob): string | null {
  const firstRange = job.pay_input_ranges[0];
  if (!firstRange) {
    return null;
  }

  const min = formatCurrencyAmount(firstRange.min_cents);
  const max = formatCurrencyAmount(firstRange.max_cents);
  const rangeText = [min, max].filter((value): value is string => value !== null).join(' - ');
  const parts = [firstRange.currency_type || null, rangeText || null, firstRange.blurb || null].filter(
    (value): value is string => Boolean(value)
  );

  return parts.length > 0 ? parts.join(' ') : null;
}

export function createGreenhouseAdapter(
  source: DiscoverySourceRecord
): SourceAdapter<GreenhouseJob> {
  return {
    sourceKind: 'greenhouse',
    normalizeJob(sourceJob: GreenhouseJob, context: SourceAdapterContext) {
      return normalizeJob(
        {
          sourceKind: 'greenhouse',
          sourceId: String(sourceJob.id),
          sourceUrl: sourceJob.absolute_url,
          companyName: source.label,
          title: sourceJob.title,
          location: sourceJob.location.name,
          remoteType: deriveRemoteType(sourceJob),
          employmentType: extractEmploymentType(sourceJob),
          compensationText: extractCompensationText(sourceJob),
          descriptionText: sourceJob.content,
          rawPayload: sourceJob,
          updatedAt: new Date(sourceJob.updated_at)
        },
        {
          capturedAt: context.capturedAt
        }
      );
    }
  };
}
