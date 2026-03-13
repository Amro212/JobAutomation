import type { ApplicantProfile, DiscoveryRunRecord, JobRecord } from '@jobautomation/core';

function getApiBaseUrl(): string {
  return process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';
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

export async function getJobs(): Promise<JobRecord[]> {
  const response = await fetchFromApi<{ jobs: JobRecord[] }>('/jobs');
  return response.jobs;
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

export async function getDiscoveryRuns(): Promise<DiscoveryRunRecord[]> {
  const response = await fetchFromApi<{ runs: DiscoveryRunRecord[] }>('/discovery-runs');
  return response.runs;
}

export async function getApplicantProfile(): Promise<ApplicantProfile | null> {
  const response = await fetchFromApi<{ profile: ApplicantProfile | null }>('/applicant-profile');
  return response.profile;
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
    throw new Error('Failed to save applicant profile.');
  }

  return ((await response.json()) as { profile: ApplicantProfile }).profile;
}
