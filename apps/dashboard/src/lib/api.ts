import type {
  ApplicantProfile,
  ApplicationRunRecord,
  ApplicationRunStatus,
  ArtifactRecord,
  DiscoveryRunRecord,
  DiscoveryRunSourceSummary,
  DiscoveryScheduleRecord,
  DiscoverySourcePatch,
  DiscoverySourceRecord,
  JobListFilters,
  JobListItem,
  JobRecord,
  JobReviewPatch,
  LogEventRecord
} from '@jobautomation/core';

export type DiscoveryRunDetail = {
  run: DiscoveryRunRecord;
  logs: LogEventRecord[];
  artifacts: ArtifactRecord[];
  sourceSummaries: DiscoveryRunSourceSummary[];
};

export type ApplicantProfileResponse = {
  profile: ApplicantProfile | null;
  readiness: {
    hasBaseResume: boolean;
    hasReusableContext: boolean;
    readyForTailoring: boolean;
  };
};

export type ApplicationRunSummary = {
  run: ApplicationRunRecord;
  job: JobRecord;
};

export type ApplicationRunDetail = ApplicationRunSummary & {
  logs: LogEventRecord[];
  artifacts: ArtifactRecord[];
};

export function getApiBaseUrl(): string {
  return process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';
}

function buildQueryString(
  values: Record<string, string | undefined>,
  arrayValues?: Record<string, string[]>
): string {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(values)) {
    if (value && value.trim().length > 0) {
      searchParams.set(key, value);
    }
  }

  if (arrayValues) {
    for (const [key, arr] of Object.entries(arrayValues)) {
      for (const value of arr) {
        searchParams.append(key, value);
      }
    }
  }

  const query = searchParams.toString();
  return query.length > 0 ? `?${query}` : '';
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
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    cache: 'no-store'
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${path}`);
  }

  return (await response.json()) as T;
}

export async function getJobs(
  filters: JobListFilters = {},
  pagination?: { page: number; pageSize: number }
): Promise<{ jobs: JobListItem[]; total: number }> {
  const response = await fetchFromApi<{ jobs: JobListItem[]; total: number }>(
    `/jobs${buildQueryString(
      {
        sourceKind: filters.sourceKind,
        status: filters.status,
        remoteType: filters.remoteType,
        title: filters.title,
        location: filters.location,
        companyName: filters.companyName,
        ...(pagination
          ? {
              page: String(pagination.page),
              pageSize: String(pagination.pageSize)
            }
          : {})
      },
      filters.locationCountries && filters.locationCountries.length > 0
        ? { country: filters.locationCountries }
        : undefined
    )}`
  );
  return response;
}

export async function getDistinctCompanyNames(
  filters: JobListFilters = {}
): Promise<string[]> {
  const response = await fetchFromApi<{ companies: string[] }>(
    `/jobs/distinct-companies${buildQueryString(
      {
        sourceKind: filters.sourceKind,
        status: filters.status,
        remoteType: filters.remoteType,
        title: filters.title,
        location: filters.location
      },
      filters.locationCountries && filters.locationCountries.length > 0
        ? { country: filters.locationCountries }
        : undefined
    )}`
  );
  return response.companies;
}

export async function getJob(jobId: string): Promise<JobRecord | null> {
  const response = await fetch(`${getApiBaseUrl()}/jobs/${jobId}`, {
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

export async function getJobReviewCapabilities(): Promise<{ scoringEnabled: boolean }> {
  return fetchFromApi<{ scoringEnabled: boolean }>('/job-reviews/capabilities');
}

export async function updateJobReview(
  jobId: string,
  payload: JobReviewPatch
): Promise<JobRecord> {
  const response = await fetch(`${getApiBaseUrl()}/job-reviews/${jobId}`, {
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
  const response = await fetch(`${getApiBaseUrl()}/job-reviews/${jobId}/shortlist`, {
    method: 'POST',
    cache: 'no-store'
  });

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return ((await response.json()) as { job: JobRecord }).job;
}

export async function removeJobFromShortlist(jobId: string): Promise<JobRecord> {
  const response = await fetch(`${getApiBaseUrl()}/job-reviews/${jobId}/shortlist`, {
    method: 'DELETE',
    cache: 'no-store'
  });

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return ((await response.json()) as { job: JobRecord }).job;
}

export async function scoreJobReview(jobId: string): Promise<JobRecord> {
  const response = await fetch(`${getApiBaseUrl()}/job-reviews/${jobId}/score`, {
    method: 'POST',
    cache: 'no-store'
  });

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return ((await response.json()) as { job: JobRecord }).job;
}

export async function getDiscoveryRuns(): Promise<DiscoveryRunRecord[]> {
  const response = await fetchFromApi<{ runs: DiscoveryRunRecord[] }>('/discovery-runs');
  return response.runs;
}

export async function getApplicationRuns(): Promise<ApplicationRunSummary[]> {
  const response = await fetchFromApi<{ runs: ApplicationRunSummary[] }>('/application-runs');
  return response.runs;
}

export async function getApplicationRun(runId: string): Promise<ApplicationRunDetail | null> {
  const response = await fetch(`${getApiBaseUrl()}/application-runs/${runId}`, {
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

export async function createApplicationRun(payload: {
  jobId: string;
}): Promise<ApplicationRunSummary> {
  const response = await fetch(`${getApiBaseUrl()}/application-runs`, {
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

export async function getDiscoveryRun(runId: string): Promise<DiscoveryRunDetail | null> {
  const response = await fetch(`${getApiBaseUrl()}/discovery-runs/${runId}`, {
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
  const response = await fetch(`${getApiBaseUrl()}/discovery-runs`, {
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
  const response = await fetch(`${getApiBaseUrl()}/discovery-runs/${runId}/retry`, {
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
  const response = await fetchFromApi<{ schedule: DiscoveryScheduleRecord }>('/discovery-schedules');
  return response.schedule;
}

export async function updateDiscoverySchedule(payload: {
  cronExpression?: string;
  timezone?: string;
  enabled?: boolean;
}): Promise<DiscoveryScheduleRecord> {
  const response = await fetch(`${getApiBaseUrl()}/discovery-schedules`, {
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
  const response = await fetchFromApi<{ sources: DiscoverySourceRecord[] }>('/discovery-sources');
  return response.sources;
}

export async function createDiscoverySource(payload: {
  sourceKind: 'greenhouse' | 'lever' | 'ashby' | 'playwright';
  sourceKey: string;
  label: string;
  enabled: boolean;
}): Promise<DiscoverySourceRecord> {
  const response = await fetch(`${getApiBaseUrl()}/discovery-sources`, {
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
  const response = await fetch(`${getApiBaseUrl()}/discovery-sources/${sourceId}`, {
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
  return fetchFromApi<ApplicantProfileResponse>('/applicant-profile');
}

export async function saveApplicantProfile(
  payload: Omit<ApplicantProfile, 'updatedAt'>
): Promise<ApplicantProfile> {
  const response = await fetch(`${getApiBaseUrl()}/applicant-profile`, {
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
  const response = await fetch(
    `${getApiBaseUrl()}/applicant-profile/job-keyword-profile/generate`,
    {
      method: 'POST',
      cache: 'no-store'
    }
  );

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return ((await response.json()) as { profile: ApplicantProfile }).profile;
}

export async function getJobArtifacts(jobId: string): Promise<ArtifactRecord[]> {
  const response = await fetchFromApi<{ job: unknown; profile: unknown; artifacts: ArtifactRecord[] }>(
    `/jobs/${jobId}/artifacts`
  );

  return response.artifacts;
}

export type GenerateArtifactsResult = {
  artifacts: ArtifactRecord[];
  warnings: string[] | undefined;
};

export async function generateJobArtifacts(
  jobId: string,
  payload: { mode?: 'both' | 'resume' | 'cover-letter' } = {}
): Promise<GenerateArtifactsResult> {
  const response = await fetch(`${getApiBaseUrl()}/jobs/${jobId}/artifacts`, {
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

  const body = (await response.json()) as { artifacts: ArtifactRecord[]; warnings?: string[] };
  return { artifacts: body.artifacts, warnings: body.warnings };
}
