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
  LogEventRecord,
  ApplicantProfile,
  DiscoveryScheduleRecord,
  DiscoverySourcePatch,
  DiscoverySourceRecord,
  JobReviewPatch
} from '@jobautomation/core';

export type ApplicantProfileResponse = {
  profile: ApplicantProfile | null;
  readiness: {
    hasBaseResume: boolean;
    hasReusableContext: boolean;
    readyForTailoring: boolean;
  };
};

export type GenerateArtifactsResult = {
  artifacts: ArtifactRecord[];
  warnings: string[] | undefined;
};


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

export type ApplicationRunsPage = {
  runs: ApplicationRunSummary[];
  total: number;
  page: number;
  pageSize: number;
};

export type ApplicationRunDetail = ApplicationRunSummary & {
  logs: LogEventRecord[];
  artifacts: ArtifactRecord[];
};

export type ApplicationRunsStats = {
  total: number;
  completedCount: number;
  failedCount: number;
  cancelledCount: number;
  skippedCount: number;
};

export type AutopilotRunSummary = {
  run: AutopilotRunRecord;
  discoveryRun: { id: string } | null;
};

export type AutopilotApplicationSummary = {
  run: ApplicationRunRecord;
  job: Pick<JobRecord, 'id' | 'title' | 'companyName' | 'location' | 'sourceUrl'>;
  resumeArtifact: ArtifactRecord | null;
  coverLetterArtifact: ArtifactRecord | null;
};

export type AutopilotRunDetail = AutopilotRunSummary & {
  applications: AutopilotApplicationSummary[];
};

let cachedApiBaseUrl: string | null = null;

export async function getApiBaseUrl(): Promise<string> {
  if (cachedApiBaseUrl) {
    return cachedApiBaseUrl;
  }

  // 1. Try to get port from Electron API if available
  let port: number | undefined;
  if (window.electronAPI?.getApiPort) {
    try {
      port = await window.electronAPI.getApiPort();
      console.log(`[api-client] Electron-provided API port candidate: ${port}`);
    } catch (err) {
      console.warn('[api-client] Failed to fetch port from window.electronAPI:', err);
    }
  }

  // 2. If we got a port from Electron, verify if it is healthy
  if (port) {
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 1000);
      const res = await fetch(`http://127.0.0.1:${port}/health`, {
        signal: controller.signal,
        cache: 'no-store'
      });
      clearTimeout(id);
      if (res.ok) {
        const url = `http://127.0.0.1:${port}`;
        cachedApiBaseUrl = url;
        console.log(`[api-client] Connected to Electron API at ${url}`);
        return url;
      }
    } catch {
      console.warn(`[api-client] API on Electron port ${port} is not online yet.`);
      // If the Electron-provided port is not online yet, don't cache it,
      // but return it as a temporary candidate so we don't scan needlessly.
      return `http://127.0.0.1:${port}`;
    }
  }

  // 3. Fallback/Scan: Try scanning local ports 3001-3010 (useful in browser mode)
  console.log('[api-client] Scanning local ports 3001-3010 for API...');
  const ports = Array.from({ length: 10 }, (_, i) => 3001 + i);
  const checkPort = async (p: number): Promise<number> => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 800);
    try {
      const res = await fetch(`http://127.0.0.1:${p}/health`, {
        signal: controller.signal,
        cache: 'no-store'
      });
      clearTimeout(id);
      if (res.ok) {
        const data = (await res.json()) as { ok?: boolean };
        if (data && (data.ok === true || typeof data.ok === 'boolean')) {
          return p;
        }
      }
      throw new Error('Not ok');
    } catch (e) {
      clearTimeout(id);
      throw e;
    }
  };

  try {
    const scannedPort = await Promise.any(ports.map(checkPort));
    const url = `http://127.0.0.1:${scannedPort}`;
    cachedApiBaseUrl = url;
    console.log(`[api-client] Discovered healthy local API at ${url} via port scan`);
    return url;
  } catch {
    // If all fail, return default but do NOT cache it, so we retry scanning next time
    return 'http://127.0.0.1:3001';
  }
}

export async function buildArtifactFileUrl(
  artifactId: string,
  download = false
): Promise<string> {
  const search = download ? '?download=1' : '';
  return `${await getApiBaseUrl()}/artifacts/${artifactId}/file${search}`;
}

function buildJobsQuery(filters: Partial<JobListFilters> = {}): string {
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

export async function getHealth(): Promise<{ ok: boolean }> {
  try {
    return await fetchFromApi('/health');
  } catch (error) {
    const url = await getApiBaseUrl();
    throw new Error(`Failed fetching ${url}/health: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function getJobs(
  filters: Partial<JobListFilters> = {}
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
  return (await fetchFromApi<{ runs: ApplicationRunSummary[] }>('/application-runs?page=1&pageSize=100')).runs;
}

export async function getApplicationRunsStats(): Promise<ApplicationRunsStats> {
  return await fetchFromApi<ApplicationRunsStats>('/application-runs/stats');
}

export async function getApplicationRunsPage(input: {
  page: number;
  pageSize: number;
  status?: string[];
}): Promise<ApplicationRunsPage> {
  const params = new URLSearchParams({
    page: String(input.page),
    pageSize: String(input.pageSize)
  });
  if (input.status && input.status.length > 0) {
    params.set('status', input.status.join(','));
  }
  return await fetchFromApi<ApplicationRunsPage>(`/application-runs?${params.toString()}`);
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

export async function updateAutopilotSettings(
  payload: AutopilotConfigInput
): Promise<AutopilotSettingsRecord> {
  const baseUrl = await getApiBaseUrl();
  const response = await fetch(`${baseUrl}/autopilot-settings`, {
    method: 'PUT',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify(payload),
    cache: 'no-store'
  });

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return ((await response.json()) as { settings: AutopilotSettingsRecord }).settings;
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

export async function getDistinctCompanyNames(
  filters: Partial<JobListFilters> = {}
): Promise<string[]> {
  const baseUrl = await getApiBaseUrl();
  const searchParams = new URLSearchParams();
  if (filters.sourceKind) searchParams.set('sourceKind', filters.sourceKind);
  if (filters.status) searchParams.set('status', filters.status);
  if (filters.remoteType) searchParams.set('remoteType', filters.remoteType);
  if (filters.title) searchParams.set('title', filters.title);
  if (filters.location) searchParams.set('location', filters.location);
  if (filters.matchProfile === 'me') searchParams.set('matchProfile', 'me');

  const query = searchParams.toString();
  const path = `/jobs/distinct-companies${query ? `?${query}` : ''}`;
  const response = await fetch(`${baseUrl}${path}`, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(await readError(response));
  }
  return ((await response.json()) as { companies: string[] }).companies;
}

export async function getJobReviewCapabilities(): Promise<{ scoringEnabled: boolean }> {
  const baseUrl = await getApiBaseUrl();
  const response = await fetch(`${baseUrl}/job-reviews/capabilities`, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(await readError(response));
  }
  return (await response.json()) as { scoringEnabled: boolean };
}

export async function updateJobReview(
  jobId: string,
  payload: JobReviewPatch
): Promise<JobRecord> {
  const baseUrl = await getApiBaseUrl();
  const response = await fetch(`${baseUrl}/job-reviews/${jobId}`, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify(payload),
    cache: 'no-store'
  });

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return ((await response.json()) as { job: JobRecord }).job;
}

export async function addJobToShortlist(jobId: string): Promise<JobRecord> {
  const baseUrl = await getApiBaseUrl();
  const response = await fetch(`${baseUrl}/job-reviews/${jobId}/shortlist`, {
    method: 'POST',
    cache: 'no-store'
  });

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return ((await response.json()) as { job: JobRecord }).job;
}

export async function removeJobFromShortlist(jobId: string): Promise<JobRecord> {
  const baseUrl = await getApiBaseUrl();
  const response = await fetch(`${baseUrl}/job-reviews/${jobId}/shortlist`, {
    method: 'DELETE',
    cache: 'no-store'
  });

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return ((await response.json()) as { job: JobRecord }).job;
}

export async function scoreJobReview(jobId: string): Promise<JobRecord> {
  const baseUrl = await getApiBaseUrl();
  const response = await fetch(`${baseUrl}/job-reviews/${jobId}/score`, {
    method: 'POST',
    cache: 'no-store'
  });

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return ((await response.json()) as { job: JobRecord }).job;
}

export async function createApplicationRun(payload: {
  jobId: string;
}): Promise<ApplicationRunSummary> {
  const baseUrl = await getApiBaseUrl();
  const response = await fetch(`${baseUrl}/application-runs`, {
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

  return (await response.json()) as ApplicationRunSummary;
}

export async function waitForDiscoveryRun(
  runId: string,
  options: { timeoutMs?: number; pollIntervalMs?: number } = {}
): Promise<DiscoveryRunDetail | null> {
  const timeoutMs = options.timeoutMs ?? 15000;
  const pollIntervalMs = options.pollIntervalMs ?? 250;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() <= deadline) {
    const detail = await getDiscoveryRun(runId);

    if (!detail) {
      return null;
    }

    if (detail.run.status !== 'pending' && detail.run.status !== 'running') {
      return detail;
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  return getDiscoveryRun(runId);
}

export async function runDiscoverySources(payload: {
  sourceIds: string[];
}): Promise<DiscoveryRunRecord[]> {
  const baseUrl = await getApiBaseUrl();
  const response = await fetch(`${baseUrl}/discovery-runs`, {
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

  return ((await response.json()) as { runs: DiscoveryRunRecord[] }).runs;
}

export async function retryDiscoveryRunStep(
  runId: string,
  payload: { sourceId: string }
): Promise<DiscoveryRunRecord> {
  const baseUrl = await getApiBaseUrl();
  const response = await fetch(`${baseUrl}/discovery-runs/${runId}/retry`, {
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

  return ((await response.json()) as { run: DiscoveryRunRecord }).run;
}

export async function getDiscoverySchedule(): Promise<DiscoveryScheduleRecord> {
  const baseUrl = await getApiBaseUrl();
  const response = await fetch(`${baseUrl}/discovery-schedules`, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(await readError(response));
  }
  return ((await response.json()) as { schedule: DiscoveryScheduleRecord }).schedule;
}

export async function updateDiscoverySchedule(payload: {
  cronExpression?: string;
  timezone?: string;
  enabled?: boolean;
}): Promise<DiscoveryScheduleRecord> {
  const baseUrl = await getApiBaseUrl();
  const response = await fetch(`${baseUrl}/discovery-schedules`, {
    method: 'PUT',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify(payload),
    cache: 'no-store'
  });

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return ((await response.json()) as { schedule: DiscoveryScheduleRecord }).schedule;
}

export async function getDiscoverySources(): Promise<DiscoverySourceRecord[]> {
  const baseUrl = await getApiBaseUrl();
  const response = await fetch(`${baseUrl}/discovery-sources`, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(await readError(response));
  }
  return ((await response.json()) as { sources: DiscoverySourceRecord[] }).sources;
}

export async function createDiscoverySource(payload: {
  sourceKind: 'greenhouse' | 'lever' | 'ashby' | 'playwright';
  sourceKey: string;
  label: string;
  enabled: boolean;
}): Promise<DiscoverySourceRecord> {
  const baseUrl = await getApiBaseUrl();
  const response = await fetch(`${baseUrl}/discovery-sources`, {
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

  return ((await response.json()) as { source: DiscoverySourceRecord }).source;
}

export async function updateDiscoverySource(
  sourceId: string,
  payload: DiscoverySourcePatch
): Promise<DiscoverySourceRecord> {
  const baseUrl = await getApiBaseUrl();
  const response = await fetch(`${baseUrl}/discovery-sources/${sourceId}`, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify(payload),
    cache: 'no-store'
  });

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return ((await response.json()) as { source: DiscoverySourceRecord }).source;
}

export async function getApplicantProfile(): Promise<ApplicantProfileResponse> {
  const baseUrl = await getApiBaseUrl();
  const response = await fetch(`${baseUrl}/applicant-profile`, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(await readError(response));
  }
  return (await response.json()) as ApplicantProfileResponse;
}

export async function saveApplicantProfile(
  payload: Omit<ApplicantProfile, 'updatedAt'>
): Promise<ApplicantProfile> {
  const baseUrl = await getApiBaseUrl();
  const response = await fetch(`${baseUrl}/applicant-profile`, {
    method: 'PUT',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify(payload),
    cache: 'no-store'
  });

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return ((await response.json()) as { profile: ApplicantProfile }).profile;
}

export async function generateApplicantJobKeywordProfile(): Promise<ApplicantProfile> {
  const baseUrl = await getApiBaseUrl();
  const response = await fetch(`${baseUrl}/applicant-profile/job-keyword-profile/generate`, {
    method: 'POST',
    cache: 'no-store'
  });

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return ((await response.json()) as { profile: ApplicantProfile }).profile;
}

export async function getJobArtifacts(jobId: string): Promise<{ artifacts: ArtifactRecord[]; profile: ApplicantProfile | null }> {
  const baseUrl = await getApiBaseUrl();
  const response = await fetch(`${baseUrl}/jobs/${jobId}/artifacts`, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(await readError(response));
  }
  return (await response.json()) as { artifacts: ArtifactRecord[]; profile: ApplicantProfile | null };
}

export async function generateJobArtifacts(
  jobId: string,
  payload: { mode?: 'both' | 'resume' | 'cover-letter' } = {}
): Promise<GenerateArtifactsResult> {
  const baseUrl = await getApiBaseUrl();
  const response = await fetch(`${baseUrl}/jobs/${jobId}/artifacts`, {
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

  return (await response.json()) as GenerateArtifactsResult;
}

