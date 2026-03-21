import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { jobListFiltersSchema } from '@jobautomation/core';

import { DiscoverySourcesPanel } from '@/components/jobs/discovery-sources-panel';
import { JobFilters } from '@/components/jobs/job-filters';
import { JobsTable } from '@/components/jobs/jobs-table';
import {
  createDiscoverySource,
  getDiscoverySources,
  getDiscoveryRun,
  getJobs,
  runDiscoverySources,
  waitForDiscoveryRun,
  updateDiscoverySource
} from '@/lib/api';

const VALID_SOURCE_KINDS = ['greenhouse', 'lever', 'ashby', 'playwright'] as const;
type ValidSourceKind = typeof VALID_SOURCE_KINDS[number];

async function addDiscoverySource(formData: FormData): Promise<void> {
  'use server';

  await createDiscoverySource({
    sourceKind: String(formData.get('sourceKind') ?? 'greenhouse') as
      | 'greenhouse'
      | 'lever'
      | 'ashby'
      | 'playwright',
    label: String(formData.get('label') ?? ''),
    sourceKey: String(formData.get('sourceKey') ?? ''),
    enabled: formData.get('enabled') === 'on'
  });

  revalidatePath('/jobs');
}

async function toggleDiscoverySource(formData: FormData): Promise<void> {
  'use server';

  const sourceId = String(formData.get('sourceId') ?? '');
  const enabled = String(formData.get('enabled') ?? '') === 'true';

  await updateDiscoverySource(sourceId, {
    enabled
  });

  revalidatePath('/jobs');
}

async function runDiscoverySourceAction(formData: FormData): Promise<void> {
  'use server';

  const sourceId = String(formData.get('sourceId') ?? '');
  const [run] = await runDiscoverySources({
    sourceIds: [sourceId]
  });
  const detail = await waitForDiscoveryRun(run.id);

  revalidatePath('/jobs');
  revalidatePath('/runs');

  const params = new URLSearchParams();
  const summary = detail?.sourceSummaries[0] ?? null;

  if (summary?.status === 'completed') {
    params.set(
      'message',
      `${summary.label}: scraped ${formatJobCount(summary.jobCount)} (${summary.newJobCount} new, ${summary.updatedJobCount} updated).`
    );
  } else if (summary?.status === 'failed') {
    params.set(
      'error',
      summary.errorMessage
        ? `${summary.label}: ${summary.errorMessage}`
        : `${summary.label}: scrape failed.`
    );
  } else {
    const latestDetail = detail ?? (await getDiscoveryRun(run.id));

    if (latestDetail?.run.status === 'completed') {
      params.set(
        'message',
        `Discovery run completed: scraped ${formatJobCount(latestDetail.run.jobCount)} (${latestDetail.run.newJobCount} new, ${latestDetail.run.updatedJobCount} updated).`
      );
    } else if (latestDetail?.run.status === 'failed') {
      params.set('error', latestDetail.run.errorMessage ?? 'Discovery run failed.');
    } else {
      params.set('message', 'Discovery run queued. Counts will appear once the run completes.');
    }
  }

  const query = params.toString();
  redirect(query.length > 0 ? `/jobs?${query}` : '/jobs');
}

function formatJobCount(count: number): string {
  return `${count} job${count === 1 ? '' : 's'}`;
}

function stripCsvQuotes(value: string | undefined): string {
  if (!value) return '';
  const trimmed = value.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

async function importDiscoverySources(formData: FormData): Promise<void> {
  'use server';

  const file = formData.get('csvFile');
  if (!file || typeof file === 'string') return;

  const blob = file as File;
  if (!blob.size) return;

  const text = await blob.text();
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const dataLines = lines.slice(1);

  for (const line of dataLines) {
    const parts = line.split(',');
    // Normalize to lowercase so "Greenhouse", "greenhouse", "GREENHOUSE" all match
    const sourceKind = stripCsvQuotes(parts[0]).toLowerCase();
    const label = stripCsvQuotes(parts[1]);
    const sourceKey = stripCsvQuotes(parts[2]);
    const enabled = stripCsvQuotes(parts[3]) !== 'false';

    if (
      !sourceKind ||
      !label ||
      !sourceKey ||
      !(VALID_SOURCE_KINDS as readonly string[]).includes(sourceKind)
    ) {
      continue;
    }

    await createDiscoverySource({
      sourceKind: sourceKind as ValidSourceKind,
      label,
      sourceKey,
      enabled
    });
  }

  revalidatePath('/jobs');
}

function getSearchParamValue(
  value: string | string[] | undefined
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function JobsPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = await searchParams;
  const filters = jobListFiltersSchema.parse({
    sourceKind: getSearchParamValue(resolvedSearchParams.sourceKind),
    status: getSearchParamValue(resolvedSearchParams.status),
    remoteType: getSearchParamValue(resolvedSearchParams.remoteType),
    title: getSearchParamValue(resolvedSearchParams.title),
    location: getSearchParamValue(resolvedSearchParams.location),
    companyName: getSearchParamValue(resolvedSearchParams.companyName)
  });
  const [jobs, sources] = await Promise.all([getJobs(filters), getDiscoverySources()]);

  return (
    <section className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Jobs</p>
        <h2 className="mt-2 text-2xl font-semibold text-foreground">
          Discovery review and intake
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Structured discovery is live for Greenhouse, Lever, and Ashby, and browser fallback can
          now onboard persisted Playwright sources when a public jobs page has no supported feed.
        </p>
      </div>
      <DiscoverySourcesPanel
        sources={sources}
        createAction={addDiscoverySource}
        runAction={runDiscoverySourceAction}
        toggleAction={toggleDiscoverySource}
        importAction={importDiscoverySources}
      />
      <JobFilters filters={filters} resetHref="/jobs" />
      <JobsTable jobs={jobs} emptyMessage="No jobs matched the current filters." />
    </section>
  );
}
