import type { SupportedApplicationSite } from '../contracts';
import { reachApplicationForm } from '../board-entry';

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

    await context.logStep(
      'board_entry_ready',
      'Reached the real Ashby application form and stopped for Stage 2 review.',
      {
        boardEntry
      }
    );

    return context.pauseForManualReview({
      step: 'board_entry_ready',
      message: 'Paused after reaching the real Ashby application form for Stage 2 review.',
      details: {
        boardEntry
      }
    });
  }
};
