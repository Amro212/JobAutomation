import type { SupportedApplicationSite } from '../contracts';
import { reachApplicationForm } from '../board-entry';
import { executeApplicationFillPlan } from '../fill-plan-executor';
import { scrapeApplicationFields } from '../form-scraper';
import { generateApplicationFillPlan } from '../openrouter-answer-module';

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
    const fillPlanResult = await generateApplicationFillPlan({
      applicantProfile: context.applicantProfile,
      job: context.job,
      fields: scrapedFields,
      openRouter: context.openRouter ?? null
    });
    const executionResult = await executeApplicationFillPlan({
      page: context.session.page,
      boardEntry,
      fields: scrapedFields,
      fillPlan: fillPlanResult.fillPlan
    });

    await context.logStep(
      'fill_plan_executed',
      'Executed an Ashby fill plan against the current visible application form and stopped for Stage 5 review.',
      {
        boardEntry,
        scrapedFields,
        promptVersion: fillPlanResult.promptVersion,
        rawResponseLength: fillPlanResult.rawResponseLength,
        promptPayload: fillPlanResult.promptPayload,
        responseJson: fillPlanResult.responseJson,
        fieldDiagnostics: fillPlanResult.fieldDiagnostics,
        fillPlan: fillPlanResult.fillPlan,
        executionResult
      }
    );

    return context.pauseForManualReview({
      step: 'fill_plan_executed',
      message: 'Paused after executing the Ashby fill plan for Stage 5 review.',
      details: {
        boardEntry,
        scrapedFields,
        promptVersion: fillPlanResult.promptVersion,
        rawResponseLength: fillPlanResult.rawResponseLength,
        promptPayload: fillPlanResult.promptPayload,
        responseJson: fillPlanResult.responseJson,
        fieldDiagnostics: fillPlanResult.fieldDiagnostics,
        fillPlan: fillPlanResult.fillPlan,
        executionResult
      }
    });
  }
};
