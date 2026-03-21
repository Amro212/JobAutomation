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

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function stripHtmlToText(value: string): string {
  return decodeHtmlEntities(
    value
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(div|p|ul|ol)>/gi, '\n')
      .replace(/<li\b[^>]*>/gi, '\n- ')
      .replace(/<[^>]+>/g, '')
  )
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function buildLeverDescription(job: LeverJob): string {
  const sections: string[] = [];
  const pushSection = (value: string | null | undefined) => {
    const trimmed = value?.trim() ?? '';
    if (trimmed.length > 0 && !sections.includes(trimmed)) {
      sections.push(trimmed);
    }
  };

  pushSection(job.descriptionBodyPlain || job.descriptionPlain);
  pushSection(job.openingPlain);

  for (const section of Array.isArray(job.lists) ? job.lists : []) {
    const heading = section.text.trim();
    const content = stripHtmlToText(section.content);

    if (heading && content) {
      pushSection(`${heading}\n${content}`);
      continue;
    }

    pushSection(heading || content);
  }

  pushSection(job.additionalPlain);

  return sections.join('\n\n');
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
          descriptionText: buildLeverDescription(sourceJob),
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
