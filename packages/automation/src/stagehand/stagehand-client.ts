export type StagehandClientInput = {
  detailPageUrl: string;
  sourcePageUrl: string;
  label: string;
  extractorId: string;
  partialJob: Record<string, unknown>;
};

export interface StagehandExtractionClient {
  extractJob(input: StagehandClientInput): Promise<unknown>;
  close(): Promise<void>;
}

function readLocalBrowserPath(): string | undefined {
  const value = process.env.STAGEHAND_LOCAL_BROWSER_PATH?.trim();
  return value && value.length > 0 ? value : undefined;
}

export async function createStagehandClient(): Promise<StagehandExtractionClient> {
  const module = (await import('@browserbasehq/stagehand')) as {
    Stagehand: new (config: Record<string, unknown>) => {
      init(): Promise<void>;
      close(): Promise<void>;
      context: {
        pages(): Array<{
          goto(url: string, options?: Record<string, unknown>): Promise<void>;
        }>;
      };
      extract(
        instruction: string,
        schema: Record<string, unknown>,
        options?: Record<string, unknown>
      ): Promise<unknown>;
    };
  };

  const localBrowserPath = readLocalBrowserPath();
  const stagehand = new module.Stagehand({
    env: process.env.STAGEHAND_ENV ?? 'LOCAL',
    modelName: process.env.STAGEHAND_MODEL ?? 'google/gemini-2.5-flash',
    modelClientOptions: {
      apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY
    },
    ...(localBrowserPath
      ? {
          localBrowserLaunchOptions: {
            executablePath: localBrowserPath,
            headless: true
          }
        }
      : {})
  });

  await stagehand.init();

  return {
    async extractJob(input: StagehandClientInput): Promise<unknown> {
      const [page] = stagehand.context.pages();
      if (!page) {
        throw new Error('Stagehand did not expose a browser page.');
      }

      await page.goto(input.detailPageUrl, {
        waitUntil: 'domcontentloaded'
      });

      return stagehand.extract(
        'Extract the public job posting fields from this page. Use visible page content only and preserve the canonical detail URL.',
        {
          type: 'object',
          properties: {
            sourceId: { type: ['string', 'null'] },
            sourceUrl: { type: 'string' },
            companyName: { type: 'string' },
            title: { type: 'string' },
            location: { type: 'string' },
            remoteType: { type: 'string' },
            employmentType: { type: ['string', 'null'] },
            compensationText: { type: ['string', 'null'] },
            descriptionText: { type: 'string' }
          },
          required: ['sourceUrl', 'companyName', 'title', 'location', 'remoteType', 'descriptionText']
        },
        {
          instructionContext: {
            sourcePageUrl: input.sourcePageUrl,
            detailPageUrl: input.detailPageUrl,
            label: input.label,
            extractorId: input.extractorId,
            partialJob: input.partialJob
          },
          page
        }
      );
    },
    async close(): Promise<void> {
      await stagehand.close();
    }
  };
}
