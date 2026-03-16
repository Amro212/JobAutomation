import { leverJobsResponseSchema, type LeverJob } from './lever-types';

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
    throw new Error(
      `Lever request failed for company ${input.companyHandle} with status ${response.status}.`
    );
  }

  return leverJobsResponseSchema.parse(await response.json());
}
