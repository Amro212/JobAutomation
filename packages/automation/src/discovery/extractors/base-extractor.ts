import type { Page } from 'playwright';

export type ExtractedPlaywrightJob = {
  detailPageUrl: string;
  sourceId: string | null;
  sourceUrl: string;
  companyName: string | null;
  title: string | null;
  location: string;
  remoteType: string;
  employmentType: string | null;
  compensationText: string | null;
  descriptionText: string;
};

export type PlaywrightExtractorContext = {
  sourcePageUrl: string;
  detailPageUrl: string;
  label: string;
};

export interface PlaywrightDiscoveryExtractor {
  id: string;
  collectDetailPageUrls(page: Page, sourcePageUrl: string): Promise<string[]>;
  extractJob(page: Page, context: PlaywrightExtractorContext): Promise<ExtractedPlaywrightJob>;
}
