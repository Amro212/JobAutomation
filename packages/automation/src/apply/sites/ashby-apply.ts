import type { SupportedApplicationSite } from '../contracts';
import { reachApplicationForm } from '../board-entry';
import { scrapeApplicationFields } from '../form-scraper';

export const ashbyApplicationSite: SupportedApplicationSite = {
  siteKey: 'ashby',
  supports(job) {
    return job.sourceKind === 'ashby';
  },
  async run(context) {
    const boardEntry = await reachApplicationForm({
      page: context.session.page,
      board: 'ashby'
    });
    const scrapedFields = await scrapeApplicationFields({
      page: context.session.page,
      boardEntry
    });

    await context.logStep(
      'fields_scraped_ready',
      'Scraped the visible Ashby application fields and stopped for Stage 3 review.',
      {
        boardEntry,
        scrapedFields
      }
    );

    return context.pauseForManualReview({
      step: 'fields_scraped_ready',
      message: 'Paused after scraping the visible Ashby application fields for Stage 3 review.',
      details: {
        boardEntry,
        scrapedFields
      }
    });
  }
};
