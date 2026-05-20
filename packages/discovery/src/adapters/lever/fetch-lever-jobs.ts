import { leverJobsResponseSchema, type LeverJob } from './lever-types';
import { InvalidDiscoverySourceError, isInvalidDiscoverySourceStatus } from '../../errors';

export type FetchLeverJobsInput = {
  companyHandle: string;
  baseUrl: string;
  fetchImpl?: typeof fetch;
};

export async function fetchLeverJobs(input: FetchLeverJobsInput): Promise<LeverJob[]> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const requestUrl = `${input.baseUrl.replace(/\/$/, '')}/${encodeURIComponent(input.companyHandle)}?mode=json`;
  const response = await fetchImpl(requestUrl);

  if (!response.ok) {
    const message = `Lever request failed for company ${input.companyHandle} with status ${response.status}.`;
    if (isInvalidDiscoverySourceStatus(response.status)) {
      throw new InvalidDiscoverySourceError(message, response.status);
    }
    throw new Error(message);
  }

  return leverJobsResponseSchema.parse(await response.json());
}
