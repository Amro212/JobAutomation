import type { SupportedApplicationSite } from '../contracts';
import { reachApplicationForm } from '../board-entry';
import { scrapeApplicationFields } from '../form-scraper';
import { generateApplicationFillPlan } from '../openrouter-answer-module';

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
    const fillPlanResult = await generateApplicationFillPlan({
      applicantProfile: context.applicantProfile,
      job: context.job,
      fields: scrapedFields,
      openRouter: context.openRouter
    });

    await context.logStep(
      'fill_plan_ready',
      'Generated a Lever fill plan from the visible application fields and stopped for Stage 4 review.',
      {
        boardEntry,
        scrapedFields,
        promptVersion: fillPlanResult.promptVersion,
        rawResponseLength: fillPlanResult.rawResponseLength,
        responseJson: fillPlanResult.responseJson,
        fillPlan: fillPlanResult.fillPlan
      }
    );

    return context.pauseForManualReview({
      step: 'fill_plan_ready',
      message: 'Paused after generating the Lever fill plan for Stage 4 review.',
      details: {
        boardEntry,
        scrapedFields,
        promptVersion: fillPlanResult.promptVersion,
        rawResponseLength: fillPlanResult.rawResponseLength,
        responseJson: fillPlanResult.responseJson,
        fillPlan: fillPlanResult.fillPlan
      }
    });
  }
};
