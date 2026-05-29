import { greenhouseJobsResponseSchema, type GreenhouseJob } from './greenhouse-types';
import { InvalidDiscoverySourceError, isInvalidDiscoverySourceStatus } from '../../errors';

export type FetchGreenhouseJobsInput = {
  boardToken: string;
  baseUrl: string;
  fetchImpl?: typeof fetch;
};

export async function fetchGreenhouseJobs(
  input: FetchGreenhouseJobsInput
): Promise<GreenhouseJob[]> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const requestUrl = `${input.baseUrl.replace(/\/$/, '')}/${encodeURIComponent(input.boardToken)}/jobs?content=true`;
  const response = await fetchImpl(requestUrl);

  if (!response.ok) {
    const message = `Greenhouse request failed for board ${input.boardToken} with status ${response.status}.`;
    if (isInvalidDiscoverySourceStatus(response.status)) {
      throw new InvalidDiscoverySourceError(message, response.status);
    }
    throw new Error(message);
  }

  const payload = greenhouseJobsResponseSchema.parse(await response.json());
  return payload.jobs;
}
