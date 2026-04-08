import type { SupportedApplicationSite } from '../contracts';
import { reachApplicationForm } from '../board-entry';

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

    await context.logStep(
      'board_entry_ready',
      'Reached the real Lever application form and stopped for Stage 2 review.',
      {
        boardEntry
      }
    );

    return context.pauseForManualReview({
      step: 'board_entry_ready',
      message: 'Paused after reaching the real Lever application form for Stage 2 review.',
      details: {
        boardEntry
      }
    });
  }
};
