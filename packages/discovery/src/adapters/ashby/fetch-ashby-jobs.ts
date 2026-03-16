import { ashbyJobsResponseSchema, type AshbyJob } from './ashby-types';

export type FetchAshbyJobsInput = {
  boardName: string;
  baseUrl: string;
  fetchImpl?: typeof fetch;
};

export async function fetchAshbyJobs(input: FetchAshbyJobsInput): Promise<AshbyJob[]> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const requestUrl = `${input.baseUrl.replace(/\/$/, '')}/${encodeURIComponent(input.boardName)}?includeCompensation=true`;
  const response = await fetchImpl(requestUrl);

  if (!response.ok) {
    throw new Error(
      `Ashby request failed for board ${input.boardName} with status ${response.status}.`
    );
  }

  return ashbyJobsResponseSchema.parse(await response.json()).jobs;
}
