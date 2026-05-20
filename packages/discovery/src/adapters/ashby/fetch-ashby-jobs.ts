import { ashbyJobsResponseSchema, type AshbyJob } from './ashby-types';
import { InvalidDiscoverySourceError, isInvalidDiscoverySourceStatus } from '../../errors';

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
    const message = `Ashby request failed for board ${input.boardName} with status ${response.status}.`;
    if (isInvalidDiscoverySourceStatus(response.status)) {
      throw new InvalidDiscoverySourceError(message, response.status);
    }
    throw new Error(message);
  }

  return ashbyJobsResponseSchema.parse(await response.json()).jobs;
}
