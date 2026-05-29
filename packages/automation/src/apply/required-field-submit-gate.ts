import type { ApplicationSiteFlowContext } from './contracts';
import type { ApplicationBoardEntryResult } from './board-entry';
import type { ExecuteApplicationFillPlanResult } from './fill-plan-executor';
import type { ScrapedApplicationField } from './form-scraper';
import type { ApplicationFillPlanEntry } from './openrouter-answer-module';
import { validateRequiredFieldExecution } from './required-field-execution-guard';

export async function guardRequiredFieldsBeforeSubmit(input: {
  context: ApplicationSiteFlowContext;
  boardEntry: ApplicationBoardEntryResult;
  scrapedFields: ScrapedApplicationField[];
  fillPlan: ApplicationFillPlanEntry[];
  fillPlanDetails: Record<string, unknown>;
  executionResult: ExecuteApplicationFillPlanResult;
  preEntryWarmup: unknown;
  preFillWarmup: unknown;
  stageTimings?: unknown;
}) {
  const requiredFieldExecutionValidation = validateRequiredFieldExecution({
    fields: input.scrapedFields,
    fillPlan: input.fillPlan,
    executionResult: input.executionResult,
    artifacts: input.context.artifacts,
  });
  const details = {
    boardEntry: input.boardEntry,
    scrapedFields: input.scrapedFields,
    ...input.fillPlanDetails,
    executionResult: input.executionResult,
    requiredFieldExecutionValidation,
    preEntryWarmup: input.preEntryWarmup,
    preFillWarmup: input.preFillWarmup,
    ...(input.stageTimings !== undefined ? { stageTimings: input.stageTimings } : {}),
    profileDirectory: input.context.session.identity.userDataDir ?? null,
  };

  if (!requiredFieldExecutionValidation.ok) {
    return input.context.pauseForManualReview({
      step: 'required_fields_incomplete_after_fill',
      message:
        'Paused before submit because required application fields were not filled successfully.',
      stopReason: 'manual_review_required',
      details,
    });
  }

  if (input.context.submissionMode === 'stop_before_submit') {
    return input.context.stopBeforeSubmit({
      step: 'required_fields_filled',
      reviewUrl: input.boardEntry.finalUrl,
      details,
    });
  }

  return null;
}
