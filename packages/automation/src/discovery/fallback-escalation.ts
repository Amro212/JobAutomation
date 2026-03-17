import type { Page } from 'playwright';

import type { ExtractedPlaywrightJob } from './extractors/base-extractor';
import {
  createStagehandClient,
  type StagehandExtractionClient
} from '../stagehand/stagehand-client';
import { extractJobWithStagehand } from '../stagehand/stagehand-discovery-adapter';

export type FallbackEscalationInput = {
  page: Page;
  sourcePageUrl: string;
  detailPageUrl: string;
  label: string;
  extractorId: string;
  partialJob: ExtractedPlaywrightJob;
};

export type FallbackEscalationResult = {
  job: ExtractedPlaywrightJob;
  stagehandUsed: true;
  rawOutput: unknown;
};

export type FallbackEscalation = (
  input: FallbackEscalationInput
) => Promise<FallbackEscalationResult | null>;

export function createFallbackEscalation(input: {
  createClient?: () => Promise<StagehandExtractionClient>;
} = {}): FallbackEscalation {
  return async (args) => {
    const client = await (input.createClient ?? createStagehandClient)();

    try {
      const result = await extractJobWithStagehand({
        client,
        detailPageUrl: args.detailPageUrl,
        sourcePageUrl: args.sourcePageUrl,
        label: args.label,
        extractorId: args.extractorId,
        partialJob: args.partialJob
      });

      return {
        job: result.job,
        stagehandUsed: true,
        rawOutput: result.rawOutput
      };
    } finally {
      await client.close();
    }
  };
}

export async function runFallbackEscalation(
  input: FallbackEscalationInput
): Promise<FallbackEscalationResult | null> {
  return createFallbackEscalation()(input);
}
