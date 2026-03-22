import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import {
  JOB_LIST_DEFAULT_PAGE_SIZE,
  jobListFiltersSchema,
  jobListQuerySchema,
  type JobListQuery
} from '@jobautomation/core';

import { DiscoverySourcesPanel } from '@/components/jobs/discovery-sources-panel';
import { JobFilters } from '@/components/jobs/job-filters';
import { JobsPagination } from '@/components/jobs/jobs-pagination';
import { JobsTable } from '@/components/jobs/jobs-table';
import {
  createDiscoverySource,
  getApplicantProfile,
  getDiscoverySources,
  getDiscoveryRun,
  getDistinctCompanyNames,
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
    } else if (latestDetail?.run.status === 'partial') {
      params.set(
        'message',
        `Discovery finished with some source errors: scraped ${formatJobCount(latestDetail.run.jobCount)} (${latestDetail.run.newJobCount} new, ${latestDetail.run.updatedJobCount} updated). Open Runs to retry failed sources.`
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

async function runAllDiscoverySourcesAction(_formData: FormData): Promise<void> {
  'use server';

  const sources = await getDiscoverySources();
  const enabledIds = sources.filter((source) => source.enabled).map((source) => source.id);

  if (enabledIds.length === 0) {
    redirect(
      `/jobs?${new URLSearchParams({
        error: 'Enable at least one discovery source before running all.'
      }).toString()}`
    );
  }

  const [run] = await runDiscoverySources({
    sourceIds: enabledIds
  });

  const detail = await waitForDiscoveryRun(run.id, { timeoutMs: 300_000 });
  revalidatePath('/jobs');
  revalidatePath('/runs');

  const params = new URLSearchParams();
  const latestDetail = detail ?? (await getDiscoveryRun(run.id));
  const sourceCount = enabledIds.length;

  if (latestDetail?.run.status === 'completed') {
    params.set(
      'message',
      `Ran ${sourceCount} sources: scraped ${formatJobCount(latestDetail.run.jobCount)} (${latestDetail.run.newJobCount} new, ${latestDetail.run.updatedJobCount} updated).`
    );
  } else if (latestDetail?.run.status === 'partial') {
    params.set(
      'message',
      `Ran ${sourceCount} sources with some errors: scraped ${formatJobCount(latestDetail.run.jobCount)} (${latestDetail.run.newJobCount} new, ${latestDetail.run.updatedJobCount} updated). Open Runs to retry failed sources.`
    );
  } else if (latestDetail?.run.status === 'failed') {
    params.set('error', latestDetail.run.errorMessage ?? 'Discovery run failed.');
  } else {
    params.set(
      'message',
      `Discovery run queued for ${sourceCount} sources. Counts will appear on Runs when complete.`
    );
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

function getSearchParamArray(
  value: string | string[] | undefined
): string[] | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'string') return value.trim().length > 0 ? [value] : undefined;
  const arr = value.filter((v) => v.trim().length > 0);
  return arr.length > 0 ? arr : undefined;
}

function buildJobsListHref(
  query: JobListQuery,
  page: number,
  pageSize: number,
  meaningfulMatchScope: boolean
): string {
  const params = new URLSearchParams();
  if (query.sourceKind) params.set('sourceKind', query.sourceKind);
  if (query.status) params.set('status', query.status);
  if (query.remoteType) params.set('remoteType', query.remoteType);
  if (query.title) params.set('title', query.title);
  if (query.location) params.set('location', query.location);
  if (query.companyName) params.set('companyName', query.companyName);
  if (query.locationCountries) {
    for (const code of query.locationCountries) {
      params.append('country', code);
    }
  }
  if (query.matchProfile === 'me') {
    params.set('matchProfile', 'me');
  } else if (query.matchProfile === 'all' && meaningfulMatchScope) {
    params.set('matchProfile', 'all');
  }
  params.set('page', String(page));
  params.set('pageSize', String(pageSize));
  const qs = params.toString();
  return qs ? `/jobs?${qs}` : '/jobs';
}

export default async function JobsPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = await searchParams;
  const { profile } = await getApplicantProfile();

  const meaningfulMatchScope =
    profile != null &&
    (profile.jobKeywordProfile != null || profile.preferredCountries.length > 0);

  const query = jobListQuerySchema.parse({
    sourceKind: getSearchParamValue(resolvedSearchParams.sourceKind),
    status: getSearchParamValue(resolvedSearchParams.status),
    remoteType: getSearchParamValue(resolvedSearchParams.remoteType),
    title: getSearchParamValue(resolvedSearchParams.title),
    location: getSearchParamValue(resolvedSearchParams.location),
    companyName: getSearchParamValue(resolvedSearchParams.companyName),
    locationCountries: getSearchParamArray(resolvedSearchParams.country),
    matchProfile: getSearchParamValue(resolvedSearchParams.matchProfile),
    page: getSearchParamValue(resolvedSearchParams.page),
    pageSize: getSearchParamValue(resolvedSearchParams.pageSize)
  });

  const explicitMatch = query.matchProfile;
  const matchProfile: 'me' | 'all' =
    explicitMatch === 'me' || explicitMatch === 'all'
      ? explicitMatch
      : meaningfulMatchScope
        ? 'me'
        : 'all';

  let filters = jobListFiltersSchema.parse({
    sourceKind: query.sourceKind,
    status: query.status,
    remoteType: query.remoteType,
    title: query.title,
    location: query.location,
    companyName: query.companyName,
    locationCountries: query.locationCountries,
    matchProfile
  });

  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? JOB_LIST_DEFAULT_PAGE_SIZE;

  const hasExplicitCountry = resolvedSearchParams.country !== undefined;
  if (!hasExplicitCountry && (!filters.locationCountries || filters.locationCountries.length === 0)) {
    if (profile && profile.preferredCountries.length > 0) {
      filters = { ...filters, locationCountries: profile.preferredCountries };
    }
  }

  const listQuery: JobListQuery = {
    ...query,
    matchProfile,
    locationCountries: filters.locationCountries
  };

  const [{ jobs, total }, companyOptions, sources] = await Promise.all([
    getJobs(filters, { page, pageSize }),
    getDistinctCompanyNames(filters),
    getDiscoverySources()
  ]);

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
          When you have a job filter profile or preferred countries on Setup, this list defaults to{' '}
          <span className="font-medium text-foreground">My matches</span> so off-target roles stay
          out of the way—use <span className="font-medium text-foreground">All jobs</span> to see the
          full discovery pool.
        </p>
      </div>
      <DiscoverySourcesPanel
        sources={sources}
        createAction={addDiscoverySource}
        runAction={runDiscoverySourceAction}
        runAllAction={runAllDiscoverySourcesAction}
        toggleAction={toggleDiscoverySource}
        importAction={importDiscoverySources}
      />
      <JobFilters
        filters={filters}
        resetHref="/jobs"
        companyOptions={companyOptions}
        showMatchScope={meaningfulMatchScope}
        matchScopeLinks={{
          meHref: buildJobsListHref({ ...listQuery, matchProfile: 'me' }, 1, pageSize, meaningfulMatchScope),
          allHref: buildJobsListHref({ ...listQuery, matchProfile: 'all' }, 1, pageSize, meaningfulMatchScope)
        }}
      />
      <JobsTable
        jobs={jobs}
        emptyMessage={
          filters.matchProfile === 'me' && total === 0
            ? 'No jobs match your Setup filter profile with the current filters. Try All jobs, relax filters, or adjust your profile on Setup.'
            : 'No jobs matched the current filters.'
        }
        footer={
          <JobsPagination
            currentPage={page}
            pageSize={pageSize}
            total={total}
            hrefForPage={(nextPage) =>
              buildJobsListHref(listQuery, nextPage, pageSize, meaningfulMatchScope)
            }
          />
        }
      />
    </section>
  );
}
