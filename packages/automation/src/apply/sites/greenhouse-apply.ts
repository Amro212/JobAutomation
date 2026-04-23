import type { SupportedApplicationSite } from '../contracts';
import { reachApplicationForm } from '../board-entry';
import { executeApplicationFillPlan } from '../fill-plan-executor';
import { scrapeApplicationFields } from '../form-scraper';
import { generateApplicationFillPlan } from '../openrouter-answer-module';
import {
  createGmailApiClient,
  isConfiguredForGmailVerification,
  pollGmailForGreenhouseVerificationCode,
  submitGreenhouseApplicationAndEnterVerificationCode
} from '../email-verification';
import {
  detectApplicationChallenge,
  warmApplicationFormBeforeFill,
  warmApplicationPageBeforeEntry,
} from '../trust-runtime';

export const greenhouseApplicationSite: SupportedApplicationSite = {
  siteKey: 'greenhouse',
  supports(job) {
    return job.sourceKind === 'greenhouse';
  },
  async run(context) {
    const preEntryWarmup = await warmApplicationPageBeforeEntry({
      page: context.session.page,
      board: 'greenhouse',
      pacing: context.session.pacing,
    });
    const boardEntry = await reachApplicationForm({
      page: context.session.page,
      board: 'greenhouse',
    });
    const preFillWarmup = await warmApplicationFormBeforeFill({
      page: context.session.page,
      board: 'greenhouse',
      boardEntry,
      pacing: context.session.pacing,
    });
    const preFillChallenge = await detectApplicationChallenge({
      page: context.session.page,
      board: 'greenhouse',
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
        'Scraped the visible Greenhouse application fields and stopped for Stage 3 review.',
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
          'Paused after scraping the visible Greenhouse application fields for Stage 3 review.',
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
      board: 'greenhouse',
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

    const emailVerificationConfig = context.applicantProfile?.emailVerification ?? null;
    if (!isConfiguredForGmailVerification(emailVerificationConfig)) {
      await context.logStep(
        'fill_plan_executed',
        'Executed the Greenhouse fill plan against the current visible application form and stopped for Stage 5 review.',
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
        message:
          'Paused after executing the Greenhouse fill plan for Stage 5 review.',
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
    }

    const verificationStartedAt = new Date();
    const verificationResult = await submitGreenhouseApplicationAndEnterVerificationCode({
      page: context.session.page,
      retrieveCode: async () =>
        pollGmailForGreenhouseVerificationCode({
          gmail: createGmailApiClient(emailVerificationConfig),
          userEmail: emailVerificationConfig.gmailUserEmail || 'me',
          submittedAt: verificationStartedAt
        })
    });

    if (verificationResult.status !== 'code_entered') {
      return context.pauseForManualReview({
        step: 'email_verification_required',
        message:
          verificationResult.message,
        stopReason: verificationResult.status,
        details: {
          boardEntry,
          scrapedFields,
          promptVersion: fillPlanResult.promptVersion,
          fillPlan: fillPlanResult.fillPlan,
          executionResult,
          verificationStatus: verificationResult.status,
          preEntryWarmup,
          preFillWarmup,
          profileDirectory: context.session.identity.userDataDir ?? null,
          pageHtml: await context.session.page.content(),
        },
      });
    }

    await context.logStep(
      'email_verification_code_entered',
      'Submitted Greenhouse application into verification, entered the email security code, and stopped before final resubmit.',
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
        verificationStatus: verificationResult.status,
        verificationMessageId: verificationResult.messageId,
        verificationSubject: verificationResult.subject,
        verificationCodeLength: verificationResult.codeLength,
        preEntryWarmup,
        preFillWarmup,
        profileDirectory: context.session.identity.userDataDir ?? null,
      }
    );

    return context.pauseForManualReview({
      step: 'email_verification_code_entered',
      message:
        'Entered the Greenhouse security code and paused before final resubmit.',
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
        verificationStatus: verificationResult.status,
        verificationMessageId: verificationResult.messageId,
        verificationSubject: verificationResult.subject,
        verificationCodeLength: verificationResult.codeLength,
        preEntryWarmup,
        preFillWarmup,
        profileDirectory: context.session.identity.userDataDir ?? null,
      },
    });
  },
};
