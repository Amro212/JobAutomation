import type {
  ApplicationRunRecord,
  AutopilotRunRecord,
  AutopilotSettingsRecord,
  DiscoveryRunRecord,
  JobListFilters,
  JobListItem,
  JobRecord
} from '@jobautomation/core';

export type ApplicationRunSummary = {
  run: ApplicationRunRecord;
  job: JobRecord;
};

export type AutopilotRunSummary = {
  run: AutopilotRunRecord;
};

let apiBaseUrlPromise: Promise<string> | null = null;

export async function getApiBaseUrl(): Promise<string> {
  if (!apiBaseUrlPromise) {
    apiBaseUrlPromise = (async () => {
      const port = (await window.electronAPI?.getApiPort?.()) ?? 3001;
      return `http://127.0.0.1:${port}`;
    })();
  }

  return apiBaseUrlPromise;
}

async function fetchFromApi<T>(path: string): Promise<T> {
  const baseUrl = await getApiBaseUrl();
  const response = await fetch(`${baseUrl}${path}`, {
    cache: 'no-store'
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${path}`);
  }

  return (await response.json()) as T;
}

function buildJobsQuery(filters: JobListFilters = {}): string {
  const searchParams = new URLSearchParams();

  if (filters.sourceKind) searchParams.set('sourceKind', filters.sourceKind);
  if (filters.status) searchParams.set('status', filters.status);
  if (filters.remoteType) searchParams.set('remoteType', filters.remoteType);
  if (filters.title) searchParams.set('title', filters.title);
  if (filters.location) searchParams.set('location', filters.location);
  if (filters.companyName) searchParams.set('companyName', filters.companyName);
  if (filters.matchProfile === 'me') searchParams.set('matchProfile', 'me');
  for (const country of filters.locationCountries ?? []) {
    searchParams.append('country', country);
  }

  const query = searchParams.toString();
  return query ? `?${query}` : '';
}

export function getHealth(): Promise<{ ok: boolean }> {
  return fetchFromApi('/health');
}

export function getJobs(
  filters: JobListFilters = {}
): Promise<{ jobs: JobListItem[]; total: number }> {
  return fetchFromApi(`/jobs${buildJobsQuery(filters)}`);
}

export function getDiscoveryRuns(): Promise<{ runs: DiscoveryRunRecord[] }> {
  return fetchFromApi('/discovery-runs');
}

export function getApplicationRuns(): Promise<{ runs: ApplicationRunSummary[] }> {
  return fetchFromApi('/application-runs');
}

export function getAutopilotRuns(): Promise<{ runs: AutopilotRunSummary[] }> {
  return fetchFromApi('/autopilot-runs');
}

export function getAutopilotSettings(): Promise<{ settings: AutopilotSettingsRecord }> {
  return fetchFromApi('/autopilot-settings');
}
