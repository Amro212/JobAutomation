import type { SupportedApplicationSite } from '../contracts';
import { reachApplicationForm } from '../board-entry';
import { executeApplicationFillPlan } from '../fill-plan-executor';
import { scrapeApplicationFields } from '../form-scraper';
import { generateApplicationFillPlan } from '../openrouter-answer-module';
import { guardRequiredFieldsBeforeSubmit } from '../required-field-submit-gate';
import { submitApplicationAndConfirm } from '../submit-application';
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
      ...(context.session.pacing !== undefined ? { pacing: context.session.pacing } : {}),
    });
    const boardEntry = await reachApplicationForm({
      page: context.session.page,
      board: 'lever',
    });
    const preFillWarmup = await warmApplicationFormBeforeFill({
      page: context.session.page,
      board: 'lever',
      boardEntry,
      ...(context.session.pacing !== undefined ? { pacing: context.session.pacing } : {}),
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
      artifacts: context.artifacts,
      openRouter: context.openRouter ?? null,
    });
    const fillPlanValidation = fillPlanResult.fillPlanValidation ?? {
      ok: true,
      missingRequiredFields: [],
    };
    const fillPlanDetails = {
      promptVersion: fillPlanResult.promptVersion,
      rawResponseLength: fillPlanResult.rawResponseLength,
      repairRawResponseLength: fillPlanResult.repairRawResponseLength,
      promptPayload: fillPlanResult.promptPayload,
      repairPromptPayload: fillPlanResult.repairPromptPayload,
      responseJson: fillPlanResult.responseJson,
      repairResponseJson: fillPlanResult.repairResponseJson,
      fieldDiagnostics: fillPlanResult.fieldDiagnostics,
      fillPlanValidation,
      missingRequiredFields: fillPlanValidation.missingRequiredFields,
      fillPlan: fillPlanResult.fillPlan,
    };

    if (!fillPlanValidation.ok) {
      return context.pauseForManualReview({
        step: 'fill_plan_required_fields_missing',
        message:
          'Paused before execution because required application fields were still missing after the repair fill-plan call.',
        stopReason: 'manual_review_required',
        details: {
          boardEntry,
          scrapedFields,
          ...fillPlanDetails,
          preEntryWarmup,
          preFillWarmup,
          profileDirectory: context.session.identity.userDataDir ?? null,
        },
      });
    }

    const executionResult = await executeApplicationFillPlan({
      page: context.session.page,
      boardEntry,
      artifacts: context.artifacts,
      fields: scrapedFields,
      fillPlan: fillPlanResult.fillPlan,
      ...(context.session.pacing !== undefined ? { pacing: context.session.pacing } : {}),
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
          ...fillPlanDetails,
          executionResult,
          preEntryWarmup,
          preFillWarmup,
          profileDirectory: context.session.identity.userDataDir ?? null,
          pageHtml: await context.session.page.content(),
        },
      });
    }

    const requiredFieldGateResult = await guardRequiredFieldsBeforeSubmit({
      context,
      boardEntry,
      scrapedFields,
      fillPlan: fillPlanResult.fillPlan,
      fillPlanDetails,
      executionResult,
      preEntryWarmup,
      preFillWarmup,
    });
    if (requiredFieldGateResult) {
      return requiredFieldGateResult;
    }

    const submissionResult = await submitApplicationAndConfirm({
      page: context.session.page,
      board: 'lever',
    });

    if (submissionResult.status !== 'submitted') {
      return context.pauseForManualReview({
        step: 'submit_confirmation_missing',
        message: submissionResult.message,
        stopReason: submissionResult.status,
        details: {
          boardEntry,
          scrapedFields,
          ...fillPlanDetails,
          executionResult,
          confirmationStatus: submissionResult.status,
          preEntryWarmup,
          preFillWarmup,
          profileDirectory: context.session.identity.userDataDir ?? null,
          pageHtml: await context.session.page.content(),
        },
      });
    }

    await context.logStep(
      'submitted',
      'Submitted the Lever application automatically.',
      {
        boardEntry,
        scrapedFields,
        ...fillPlanDetails,
        executionResult,
        confirmationStatus: submissionResult.status,
        confirmationMessage: submissionResult.confirmationMessage,
        submitButtonSource: submissionResult.submitButtonSource,
        preEntryWarmup,
        preFillWarmup,
        profileDirectory: context.session.identity.userDataDir ?? null,
      }
    );

    return context.completeRun({
      step: 'submitted',
      message: 'Submitted the Lever application automatically.',
      details: {
        boardEntry,
        scrapedFields,
        ...fillPlanDetails,
        executionResult,
        confirmationStatus: submissionResult.status,
        confirmationMessage: submissionResult.confirmationMessage,
        submitButtonSource: submissionResult.submitButtonSource,
        preEntryWarmup,
        preFillWarmup,
        profileDirectory: context.session.identity.userDataDir ?? null,
      },
    });
  },
};
