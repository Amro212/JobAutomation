import type { SupportedApplicationSite } from '../contracts';
import { reachApplicationForm } from '../board-entry';
import { executeApplicationFillPlan } from '../fill-plan-executor';
import { scrapeApplicationFields } from '../form-scraper';
import { generateApplicationFillPlan } from '../openrouter-answer-module';
import {
  detectApplicationChallenge,
  warmApplicationFormBeforeFill,
  warmApplicationPageBeforeEntry,
} from '../trust-runtime';

export const leverApplicationSite: SupportedApplicationSite = {
  siteKey: 'lever',
  supports(job) {
    return job.sourceKind === 'lever';
  },
  async run(context) {
    const preEntryWarmup = await warmApplicationPageBeforeEntry({
      page: context.session.page,
      board: 'lever',
      pacing: context.session.pacing,
    });
    const boardEntry = await reachApplicationForm({
      page: context.session.page,
      board: 'lever',
    });
    const preFillWarmup = await warmApplicationFormBeforeFill({
      page: context.session.page,
      board: 'lever',
      boardEntry,
      pacing: context.session.pacing,
    });
    const preFillChallenge = await detectApplicationChallenge({
      page: context.session.page,
      board: 'lever',
      phase: 'before_scrape',
    });
    if (preFillChallenge) {
      return context.pauseForManualReview({
        step: preFillChallenge.phase,
        message: preFillChallenge.message,
        stopReason: preFillChallenge.kind,
        details: {
          challengeSignal: preFillChallenge,
          boardEntry,
          preEntryWarmup,
          preFillWarmup,
          profileDirectory: context.session.identity.userDataDir ?? null,
          pageHtml: await context.session.page.content(),
        },
      });
    }

    const scrapedFields = await scrapeApplicationFields({
      page: context.session.page,
      boardEntry,
    });

    if (!context.openRouter?.apiKey) {
      await context.logStep(
        'fields_scraped_ready',
        'Scraped the visible Lever application fields and stopped for Stage 3 review.',
        {
          boardEntry,
          scrapedFields,
          preEntryWarmup,
          preFillWarmup,
          profileDirectory: context.session.identity.userDataDir ?? null,
        }
      );

      return context.pauseForManualReview({
        step: 'fields_scraped_ready',
        message:
          'Paused after scraping the visible Lever application fields for Stage 3 review.',
        details: {
          boardEntry,
          scrapedFields,
          preEntryWarmup,
          preFillWarmup,
          profileDirectory: context.session.identity.userDataDir ?? null,
        },
      });
    }

    const fillPlanResult = await generateApplicationFillPlan({
      applicantProfile: context.applicantProfile,
      job: context.job,
      fields: scrapedFields,
      openRouter: context.openRouter ?? null,
    });
    const executionResult = await executeApplicationFillPlan({
      page: context.session.page,
      boardEntry,
      artifacts: context.artifacts,
      fields: scrapedFields,
      fillPlan: fillPlanResult.fillPlan,
      pacing: context.session.pacing,
    });
    const postFillChallenge = await detectApplicationChallenge({
      page: context.session.page,
      board: 'lever',
      phase: 'after_fill',
    });
    if (postFillChallenge) {
      return context.pauseForManualReview({
        step: postFillChallenge.phase,
        message: postFillChallenge.message,
        stopReason: postFillChallenge.kind,
        details: {
          challengeSignal: postFillChallenge,
          boardEntry,
          scrapedFields,
          fillPlan: fillPlanResult.fillPlan,
          executionResult,
          preEntryWarmup,
          preFillWarmup,
          profileDirectory: context.session.identity.userDataDir ?? null,
          pageHtml: await context.session.page.content(),
        },
      });
    }

    await context.logStep(
      'fill_plan_executed',
      'Executed the Lever fill plan against the current visible application form and stopped for Stage 5 review.',
      {
        boardEntry,
        scrapedFields,
        promptVersion: fillPlanResult.promptVersion,
        rawResponseLength: fillPlanResult.rawResponseLength,
        promptPayload: fillPlanResult.promptPayload,
        responseJson: fillPlanResult.responseJson,
        fieldDiagnostics: fillPlanResult.fieldDiagnostics,
        fillPlan: fillPlanResult.fillPlan,
        executionResult,
        preEntryWarmup,
        preFillWarmup,
        profileDirectory: context.session.identity.userDataDir ?? null,
      }
    );

    return context.pauseForManualReview({
      step: 'fill_plan_executed',
      message: 'Paused after executing the Lever fill plan for Stage 5 review.',
      details: {
        boardEntry,
        scrapedFields,
        promptVersion: fillPlanResult.promptVersion,
        rawResponseLength: fillPlanResult.rawResponseLength,
        promptPayload: fillPlanResult.promptPayload,
        responseJson: fillPlanResult.responseJson,
        fieldDiagnostics: fillPlanResult.fieldDiagnostics,
        fillPlan: fillPlanResult.fillPlan,
        executionResult,
        preEntryWarmup,
        preFillWarmup,
        profileDirectory: context.session.identity.userDataDir ?? null,
      },
    });
  },
};
