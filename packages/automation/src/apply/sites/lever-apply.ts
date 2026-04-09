import type { SupportedApplicationSite } from '../contracts';
import { reachApplicationForm } from '../board-entry';
import { scrapeApplicationFields } from '../form-scraper';

export const leverApplicationSite: SupportedApplicationSite = {
  siteKey: 'lever',
  supports(job) {
    return job.sourceKind === 'lever';
  },
  async run(context) {
    const boardEntry = await reachApplicationForm({
      page: context.session.page,
      board: 'lever'
    });
    const scrapedFields = await scrapeApplicationFields({
      page: context.session.page,
      boardEntry
    });

    await context.logStep(
      'fields_scraped_ready',
      'Scraped the visible Lever application fields and stopped for Stage 3 review.',
      {
        boardEntry,
        scrapedFields
      }
    );

    return context.pauseForManualReview({
      step: 'fields_scraped_ready',
      message: 'Paused after scraping the visible Lever application fields for Stage 3 review.',
      details: {
        boardEntry,
        scrapedFields
      }
    });
  }
};
