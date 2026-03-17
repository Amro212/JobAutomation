import type { ExtractedPlaywrightJob } from '../discovery/extractors/base-extractor';
import type {
  StagehandClientInput,
  StagehandExtractionClient
} from './stagehand-client';
import {
  stagehandExtractedJobSchema,
  type StagehandExtractedJob
} from './stagehand-schemas';

export type StagehandDiscoveryInput = StagehandClientInput & {
  client: StagehandExtractionClient;
};

export type StagehandDiscoveryResult = {
  job: ExtractedPlaywrightJob;
  rawOutput: unknown;
};

export class StagehandExtractionError extends Error {
  constructor(message: string, readonly rawOutput: unknown) {
    super(message);
    this.name = 'StagehandExtractionError';
  }
}

function toPlaywrightJob(job: StagehandExtractedJob, detailPageUrl: string): ExtractedPlaywrightJob {
  return {
    detailPageUrl,
    sourceId: job.sourceId,
    sourceUrl: job.sourceUrl,
    companyName: job.companyName,
    title: job.title,
    location: job.location,
    remoteType: job.remoteType,
    employmentType: job.employmentType,
    compensationText: job.compensationText,
    descriptionText: job.descriptionText
  };
}

export async function extractJobWithStagehand(
  input: StagehandDiscoveryInput
): Promise<StagehandDiscoveryResult> {
  const rawOutput = await input.client.extractJob(input);

  let parsed: StagehandExtractedJob;
  try {
    parsed = stagehandExtractedJobSchema.parse(rawOutput);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown Stagehand schema error.';
    throw new StagehandExtractionError(
      `Stagehand extraction failed validation: ${message}`,
      rawOutput
    );
  }

  return {
    job: toPlaywrightJob(parsed, input.detailPageUrl),
    rawOutput
  };
}
