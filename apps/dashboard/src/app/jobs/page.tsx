import { revalidatePath } from 'next/cache';

import { jobListFiltersSchema } from '@jobautomation/core';

import { DiscoverySourcesPanel } from '../../components/jobs/discovery-sources-panel';
import { JobFilters } from '../../components/jobs/job-filters';
import { JobsTable } from '../../components/jobs/jobs-table';
import {
  createDiscoverySource,
  getDiscoverySources,
  getJobs,
  runDiscoverySources,
  updateDiscoverySource
} from '../../lib/api';

async function addDiscoverySource(formData: FormData): Promise<void> {
  'use server';

  await createDiscoverySource({
    sourceKind: String(formData.get('sourceKind') ?? 'greenhouse') as
      | 'greenhouse'
      | 'lever'
      | 'ashby',
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
  await runDiscoverySources({
    sourceIds: [sourceId]
  });

  revalidatePath('/jobs');
  revalidatePath('/runs');
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
    location: getSearchParamValue(resolvedSearchParams.location)
  });
  const [jobs, sources] = await Promise.all([getJobs(filters), getDiscoverySources()]);

  return (
    <section className="space-y-6">
      <div>
        <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Jobs</p>
        <h2 className="mt-2 text-2xl font-semibold text-slate-900">
          Discovery review and intake
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Structured discovery is live for Greenhouse, Lever, and Ashby. Run sources, then review,
          filter, and shortlist the persisted jobs below.
        </p>
      </div>
      <DiscoverySourcesPanel
        sources={sources}
        createAction={addDiscoverySource}
        runAction={runDiscoverySourceAction}
        toggleAction={toggleDiscoverySource}
      />
      <JobFilters filters={filters} resetHref="/jobs" />
      <JobsTable jobs={jobs} emptyMessage="No jobs matched the current filters." />
    </section>
  );
}
