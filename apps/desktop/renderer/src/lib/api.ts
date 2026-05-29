import type {
  AutopilotConfigInput,
  ApplicationRunRecord,
  AutopilotRunRecord,
  AutopilotSettingsRecord,
  ArtifactRecord,
  DiscoveryRunRecord,
  DiscoveryRunSourceSummary,
  JobListFilters,
  JobListItem,
  JobRecord,
  LogEventRecord
} from '@jobautomation/core';

export type DiscoveryRunDetail = {
  run: DiscoveryRunRecord;
  logs: LogEventRecord[];
  artifacts: ArtifactRecord[];
  sourceSummaries: DiscoveryRunSourceSummary[];
};

export type ApplicationRunSummary = {
  run: ApplicationRunRecord;
  job: JobRecord;
  resumeArtifact: ArtifactRecord | null;
  coverLetterArtifact: ArtifactRecord | null;
};

export type ApplicationRunDetail = ApplicationRunSummary & {
  logs: LogEventRecord[];
  artifacts: ArtifactRecord[];
};

export type AutopilotRunSummary = {
  run: AutopilotRunRecord;
  discoveryRun: { id: string } | null;
};

export type AutopilotApplicationSummary = {
  run: ApplicationRunRecord;
  job: Pick<JobRecord, 'id' | 'title' | 'companyName' | 'location'>;
  resumeArtifact: ArtifactRecord | null;
  coverLetterArtifact: ArtifactRecord | null;
};

export type AutopilotRunDetail = AutopilotRunSummary & {
  applications: AutopilotApplicationSummary[];
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

export async function buildArtifactFileUrl(
  artifactId: string,
  download = false
): Promise<string> {
  const search = download ? '?download=1' : '';
  return `${await getApiBaseUrl()}/artifacts/${artifactId}/file${search}`;
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

async function readError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { message?: string };
    return payload.message ?? 'API request failed.';
  } catch {
    return 'API request failed.';
  }
}

async function fetchFromApi<T>(path: string): Promise<T> {
  const baseUrl = await getApiBaseUrl();
  const response = await fetch(`${baseUrl}${path}`, {
    cache: 'no-store'
  });

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return (await response.json()) as T;
}

export function getHealth(): Promise<{ ok: boolean }> {
  return fetchFromApi('/health');
}

export function getJobs(
  filters: JobListFilters = {}
): Promise<{ jobs: JobListItem[]; total: number }> {
  return fetchFromApi(`/jobs${buildJobsQuery(filters)}`);
}

export async function getJob(jobId: string): Promise<JobRecord | null> {
  const baseUrl = await getApiBaseUrl();
  const response = await fetch(`${baseUrl}/jobs/${jobId}`, {
    cache: 'no-store'
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`API request failed: /jobs/${jobId}`);
  }

  return ((await response.json()) as { job: JobRecord }).job;
}

export async function getDiscoveryRuns(): Promise<DiscoveryRunRecord[]> {
  return (await fetchFromApi<{ runs: DiscoveryRunRecord[] }>('/discovery-runs')).runs;
}

export async function getDiscoveryRun(
  runId: string
): Promise<DiscoveryRunDetail | null> {
  const baseUrl = await getApiBaseUrl();
  const response = await fetch(`${baseUrl}/discovery-runs/${runId}`, {
    cache: 'no-store'
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`API request failed: /discovery-runs/${runId}`);
  }

  return (await response.json()) as DiscoveryRunDetail;
}

export async function getApplicationRuns(): Promise<ApplicationRunSummary[]> {
  return (await fetchFromApi<{ runs: ApplicationRunSummary[] }>('/application-runs')).runs;
}

export async function getApplicationRun(
  runId: string
): Promise<ApplicationRunDetail | null> {
  const baseUrl = await getApiBaseUrl();
  const response = await fetch(`${baseUrl}/application-runs/${runId}`, {
    cache: 'no-store'
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`API request failed: /application-runs/${runId}`);
  }

  return (await response.json()) as ApplicationRunDetail;
}

export async function getAutopilotRuns(): Promise<AutopilotRunSummary[]> {
  return (await fetchFromApi<{ runs: AutopilotRunSummary[] }>('/autopilot-runs')).runs;
}

export async function getAutopilotRun(
  runId: string
): Promise<AutopilotRunDetail | null> {
  const baseUrl = await getApiBaseUrl();
  const response = await fetch(`${baseUrl}/autopilot-runs/${runId}`, {
    cache: 'no-store'
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`API request failed: /autopilot-runs/${runId}`);
  }

  return (await response.json()) as AutopilotRunDetail;
}

export async function getAutopilotSettings(): Promise<AutopilotSettingsRecord> {
  return (await fetchFromApi<{ settings: AutopilotSettingsRecord }>(
    '/autopilot-settings'
  )).settings;
}

export async function createAutopilotRun(
  payload: AutopilotConfigInput = {}
): Promise<{ run: AutopilotRunRecord }> {
  const baseUrl = await getApiBaseUrl();
  const response = await fetch(`${baseUrl}/autopilot-runs`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify(payload),
    cache: 'no-store'
  });

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return (await response.json()) as { run: AutopilotRunRecord };
}

export async function cancelAutopilotRun(
  runId: string
): Promise<{ accepted: boolean; active: boolean }> {
  const baseUrl = await getApiBaseUrl();
  const response = await fetch(`${baseUrl}/autopilot-runs/${runId}/cancel`, {
    method: 'POST',
    cache: 'no-store'
  });

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return (await response.json()) as { accepted: boolean; active: boolean };
}
