import { greenhouseJobsResponseSchema, type GreenhouseJob } from './greenhouse-types';

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
    throw new Error(
      `Greenhouse request failed for board ${input.boardToken} with status ${response.status}.`
    );
  }

  const payload = greenhouseJobsResponseSchema.parse(await response.json());
  return payload.jobs;
}