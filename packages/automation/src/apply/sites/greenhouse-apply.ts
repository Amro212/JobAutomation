import type { InteractionPacingProfile, SupportedApplicationSite } from '../contracts';
import { reachApplicationForm } from '../board-entry';
import { executeApplicationFillPlan } from '../fill-plan-executor';
import { scrapeApplicationFields } from '../form-scraper';
import { generateApplicationFillPlan } from '../openrouter-answer-module';
import { guardRequiredFieldsBeforeSubmit } from '../required-field-submit-gate';
import { confirmApplicationSubmission, submitApplicationAndConfirm } from '../submit-application';
import {
  createGmailApiClient,
  isEnabledForGmailVerification,
  isConfiguredForGmailVerification,
  pollGmailForGreenhouseVerificationCode,
  resolveEmailVerificationConfig,
  submitGreenhouseApplicationAndEnterVerificationCode
} from '../email-verification';
import {
  detectApplicationChallenge,
  warmApplicationFormBeforeFill,
  warmApplicationPageBeforeEntry,
} from '../trust-runtime';
import { createApplicationStageTimer } from './stage-timer';

const GREENHOUSE_VERIFICATION_TIMEOUT_MS = 3 * 60_000;

const GREENHOUSE_PACING: InteractionPacingProfile = {
  typingDelayMs: [5, 10],
  preFieldDelayMs: [0, 5],
  postFieldDelayMs: [3, 8],
  sectionReadDelayMs: [8, 15],
  preApplyReadDelayMs: [15, 30],
};

function resolveGreenhousePacing(
  pacing?: InteractionPacingProfile
): InteractionPacingProfile {
  return {
    ...(pacing ?? {}),
    ...GREENHOUSE_PACING,
  };
}

export const greenhouseApplicationSite: SupportedApplicationSite = {
  siteKey: 'greenhouse',
  supports(job) {
    return job.sourceKind === 'greenhouse';
  },
  async run(context) {
    const stageTimer = createApplicationStageTimer();
    const greenhousePacing = resolveGreenhousePacing(context.session.pacing);
    const preEntryWarmup = await stageTimer.timePhase('warmup.before_entry', () =>
      warmApplicationPageBeforeEntry({
        page: context.session.page,
        board: 'greenhouse',
        pacing: greenhousePacing,
      })
    );
    const boardEntry = await stageTimer.timePhase('entry.reach_application_form', () =>
      reachApplicationForm({
        page: context.session.page,
        board: 'greenhouse',
      })
    );
    const preFillWarmup = await stageTimer.timePhase('warmup.before_fill', () =>
      warmApplicationFormBeforeFill({
        page: context.session.page,
        board: 'greenhouse',
        boardEntry,
        pacing: greenhousePacing,
      })
    );
    const preFillChallenge = await stageTimer.timePhase('challenge.before_scrape', () =>
      detectApplicationChallenge({
        page: context.session.page,
        board: 'greenhouse',
        phase: 'before_scrape',
      })
    );
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
          stageTimings: stageTimer.snapshot(),
          profileDirectory: context.session.identity.userDataDir ?? null,
          pageHtml: await context.session.page.content(),
        },
      });
    }

    const scrapedFields = await stageTimer.timePhase('stage3.scrape_fields', () =>
      scrapeApplicationFields({
        page: context.session.page,
        boardEntry,
      })
    );

    if (!context.answerProvider && !context.openRouter?.apiKey) {
      await context.logStep(
        'fields_scraped_ready',
        'Scraped the visible Greenhouse application fields and stopped for Stage 3 review.',
        {
          boardEntry,
          scrapedFields,
          preEntryWarmup,
          preFillWarmup,
          stageTimings: stageTimer.snapshot(),
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
          stageTimings: stageTimer.snapshot(),
          profileDirectory: context.session.identity.userDataDir ?? null,
        },
      });
    }

    const fillPlanResult = await stageTimer.timePhase('stage4.generate_fill_plan', () =>
      generateApplicationFillPlan({
        applicantProfile: context.applicantProfile,
        job: context.job,
        fields: scrapedFields,
        artifacts: context.artifacts,
        openRouter: context.openRouter ?? null,
        provider: context.answerProvider ?? undefined
      })
    );
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
          stageTimings: stageTimer.snapshot(),
          profileDirectory: context.session.identity.userDataDir ?? null,
        },
      });
    }

    const executionResult = await stageTimer.timePhase('stage5.execute_fill_plan', () =>
      executeApplicationFillPlan({
        page: context.session.page,
        boardEntry,
        artifacts: context.artifacts,
        fields: scrapedFields,
        fillPlan: fillPlanResult.fillPlan,
        pacing: greenhousePacing,
      })
    );
    const postFillChallenge = await stageTimer.timePhase('challenge.after_fill', () =>
      detectApplicationChallenge({
        page: context.session.page,
        board: 'greenhouse',
        phase: 'after_fill',
      })
    );
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
          stageTimings: stageTimer.snapshot(),
          profileDirectory: context.session.identity.userDataDir ?? null,
          pageHtml: await context.session.page.content(),
        },
      });
    }

    const requiredFieldGateResult = await stageTimer.timePhase('required_field_gate', () =>
      guardRequiredFieldsBeforeSubmit({
        context,
        boardEntry,
        scrapedFields,
        fillPlan: fillPlanResult.fillPlan,
        fillPlanDetails,
        executionResult,
        preEntryWarmup,
        preFillWarmup,
        stageTimings: stageTimer.snapshot(),
      })
    );
    if (requiredFieldGateResult) {
      return requiredFieldGateResult;
    }

    const emailVerificationConfig = resolveEmailVerificationConfig(
      context.applicantProfile?.emailVerification ?? null
    );
    const logVerificationDebug = async (
      event: string,
      details?: Record<string, unknown>
    ): Promise<void> => {
      await context.logStep(
        'email_verification_debug',
        `Greenhouse email verification debug: ${event}.`,
        {
          event,
          stageTimings: stageTimer.snapshot(),
          ...(details ?? {})
        }
      );
    };
    await logVerificationDebug('resolved_email_verification_config', {
      enabled: isEnabledForGmailVerification(emailVerificationConfig),
      configured: isConfiguredForGmailVerification(emailVerificationConfig),
      provider: emailVerificationConfig?.provider ?? null,
      gmailUserEmail: emailVerificationConfig?.gmailUserEmail ?? null,
      hasClientId: Boolean(emailVerificationConfig?.gmailClientId.trim()),
      hasClientSecret: Boolean(emailVerificationConfig?.gmailClientSecret.trim()),
      hasRefreshToken: Boolean(emailVerificationConfig?.gmailRefreshToken.trim())
    });
    if (!isEnabledForGmailVerification(emailVerificationConfig)) {
      const submissionResult = await stageTimer.timePhase('submit.confirm', () =>
        submitApplicationAndConfirm({
          page: context.session.page,
          board: 'greenhouse',
        })
      );

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
            stageTimings: stageTimer.snapshot(),
            profileDirectory: context.session.identity.userDataDir ?? null,
            pageHtml: await context.session.page.content(),
          },
        });
      }

      await context.logStep(
        'submitted',
        'Submitted the Greenhouse application automatically.',
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
          stageTimings: stageTimer.snapshot(),
          profileDirectory: context.session.identity.userDataDir ?? null,
        }
      );

      return context.completeRun({
        step: 'submitted',
        message: 'Submitted the Greenhouse application automatically.',
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
          stageTimings: stageTimer.snapshot(),
          profileDirectory: context.session.identity.userDataDir ?? null,
        },
      });
    }

    const gmailVerificationConfig = emailVerificationConfig;
    const isGmailConfigComplete = Boolean(
      gmailVerificationConfig.gmailUserEmail.trim() &&
        gmailVerificationConfig.gmailClientId.trim() &&
        gmailVerificationConfig.gmailClientSecret.trim() &&
        gmailVerificationConfig.gmailRefreshToken.trim()
    );
    const verificationResult = await stageTimer.timePhase('submit.email_verification', () =>
      submitGreenhouseApplicationAndEnterVerificationCode({
        page: context.session.page,
        debugLog: logVerificationDebug,
        retrieveCode: async (submittedAt) => {
          if (!isGmailConfigComplete) {
            await logVerificationDebug('gmail_oauth_not_configured', {
              gmailUserEmail: gmailVerificationConfig.gmailUserEmail || null,
              hasClientId: Boolean(gmailVerificationConfig.gmailClientId.trim()),
              hasClientSecret: Boolean(gmailVerificationConfig.gmailClientSecret.trim()),
              hasRefreshToken: Boolean(gmailVerificationConfig.gmailRefreshToken.trim())
            });
            return {
              status: 'not_configured' as const,
              message:
                'Greenhouse verification challenge triggered, but Gmail OAuth is incomplete. Add Gmail address, client ID, client secret, and refresh token in setup.'
            };
          }

          return pollGmailForGreenhouseVerificationCode({
            gmail: createGmailApiClient(gmailVerificationConfig),
            userEmail: gmailVerificationConfig.gmailUserEmail || 'me',
            submittedAt,
            timeoutMs: GREENHOUSE_VERIFICATION_TIMEOUT_MS,
            debugLog: logVerificationDebug
          });
        }
      })
    );
    const verificationMessage =
      'message' in verificationResult
        ? verificationResult.message
        : 'Greenhouse verification code was retrieved, but the application could not complete verification automatically.';
    await logVerificationDebug('greenhouse_verification_result', {
      status: verificationResult.status,
      ...(verificationResult.status === 'code_entered'
        ? {
            messageId: verificationResult.messageId,
            subject: verificationResult.subject,
            codeLength: verificationResult.codeLength
          }
        : {
            message: verificationMessage
          })
    });

    if (verificationResult.status === 'challenge_not_visible') {
      const submissionResult = await stageTimer.timePhase('submit.confirm_after_verification_probe', () =>
        confirmApplicationSubmission({
          page: context.session.page,
          board: 'greenhouse',
          submitButtonSource: 'greenhouse_email_verification_submit'
        })
      );

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
            verificationStatus: verificationResult.status,
            preEntryWarmup,
            preFillWarmup,
            stageTimings: stageTimer.snapshot(),
            profileDirectory: context.session.identity.userDataDir ?? null,
            pageHtml: await context.session.page.content(),
          },
        });
      }

      await context.logStep(
        'submitted',
        'Submitted the Greenhouse application without an email security challenge.',
        {
          boardEntry,
          scrapedFields,
          ...fillPlanDetails,
          executionResult,
          confirmationStatus: submissionResult.status,
          confirmationMessage: submissionResult.confirmationMessage,
          submitButtonSource: submissionResult.submitButtonSource,
          verificationStatus: verificationResult.status,
          preEntryWarmup,
          preFillWarmup,
          stageTimings: stageTimer.snapshot(),
          profileDirectory: context.session.identity.userDataDir ?? null,
        }
      );

      return context.completeRun({
        step: 'submitted',
        message: 'Submitted the Greenhouse application without an email security challenge.',
        details: {
          boardEntry,
          scrapedFields,
          ...fillPlanDetails,
          executionResult,
          confirmationStatus: submissionResult.status,
          confirmationMessage: submissionResult.confirmationMessage,
          submitButtonSource: submissionResult.submitButtonSource,
          verificationStatus: verificationResult.status,
          preEntryWarmup,
          preFillWarmup,
          stageTimings: stageTimer.snapshot(),
          profileDirectory: context.session.identity.userDataDir ?? null,
        },
      });
    }

    if (verificationResult.status !== 'code_entered') {
      return context.pauseForManualReview({
        step: 'email_verification_required',
        message:
          verificationMessage,
        stopReason: verificationResult.status,
        details: {
          boardEntry,
          scrapedFields,
          ...fillPlanDetails,
          executionResult,
          verificationStatus: verificationResult.status,
          preEntryWarmup,
          preFillWarmup,
          stageTimings: stageTimer.snapshot(),
          profileDirectory: context.session.identity.userDataDir ?? null,
          pageHtml: await context.session.page.content(),
        },
      });
    }

    const submissionResult = await stageTimer.timePhase('submit.confirm_after_code', () =>
      submitApplicationAndConfirm({
        page: context.session.page,
        board: 'greenhouse',
      })
    );

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
          verificationStatus: verificationResult.status,
          verificationMessageId: verificationResult.messageId,
          verificationSubject: verificationResult.subject,
          verificationCodeLength: verificationResult.codeLength,
          preEntryWarmup,
          preFillWarmup,
          stageTimings: stageTimer.snapshot(),
          profileDirectory: context.session.identity.userDataDir ?? null,
          pageHtml: await context.session.page.content(),
        },
      });
    }

    await context.logStep(
      'submitted',
      'Submitted the Greenhouse application after entering the email security code.',
      {
        boardEntry,
        scrapedFields,
        ...fillPlanDetails,
        executionResult,
        confirmationStatus: submissionResult.status,
        confirmationMessage: submissionResult.confirmationMessage,
        submitButtonSource: submissionResult.submitButtonSource,
        verificationStatus: verificationResult.status,
        verificationMessageId: verificationResult.messageId,
        verificationSubject: verificationResult.subject,
        verificationCodeLength: verificationResult.codeLength,
        preEntryWarmup,
        preFillWarmup,
        stageTimings: stageTimer.snapshot(),
        profileDirectory: context.session.identity.userDataDir ?? null,
      }
    );

    return context.completeRun({
      step: 'submitted',
      message: 'Submitted the Greenhouse application after entering the email security code.',
      details: {
        boardEntry,
        scrapedFields,
        ...fillPlanDetails,
        executionResult,
        confirmationStatus: submissionResult.status,
        confirmationMessage: submissionResult.confirmationMessage,
        submitButtonSource: submissionResult.submitButtonSource,
        verificationStatus: verificationResult.status,
        verificationMessageId: verificationResult.messageId,
        verificationSubject: verificationResult.subject,
        verificationCodeLength: verificationResult.codeLength,
        preEntryWarmup,
        preFillWarmup,
        stageTimings: stageTimer.snapshot(),
        profileDirectory: context.session.identity.userDataDir ?? null,
      },
    });
  },
};
