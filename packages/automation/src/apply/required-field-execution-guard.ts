import type { ApplicationArtifacts } from './contracts';
import type { ExecuteApplicationFillPlanResult } from './fill-plan-executor';
import type { ScrapedApplicationField } from './form-scraper';
import type { ApplicationFillPlanEntry } from './openrouter-answer-module';
import {
  validateRequiredFillPlan,
  type ApplicationFillPlanMissingRequiredField,
} from './fill-plan-validator';
import { isFieldRequired } from './field-contract';

export type RequiredFieldExecutionGuardResult = {
  ok: boolean;
  missingRequiredFields: ApplicationFillPlanMissingRequiredField[];
};

export function validateRequiredFieldExecution(input: {
  fields: ScrapedApplicationField[];
  fillPlan: ApplicationFillPlanEntry[];
  executionResult: ExecuteApplicationFillPlanResult;
  artifacts?: ApplicationArtifacts;
}): RequiredFieldExecutionGuardResult {
  const fillPlanValidation = validateRequiredFillPlan({
    fields: input.fields,
    fillPlan: input.fillPlan,
    ...(input.artifacts !== undefined ? { artifacts: input.artifacts } : {}),
  });
  const missingRequiredFields = [...fillPlanValidation.missingRequiredFields];
  const executionResultByFieldId = new Map(
    input.executionResult.results.map((result) => [result.fieldId, result])
  );

  for (const field of input.fields) {
    if (!isFieldRequired(field)) {
      continue;
    }

    if (
      missingRequiredFields.some(
        (missingField) => missingField.fieldId === field.id
      )
    ) {
      continue;
    }

    const result = executionResultByFieldId.get(field.id);
    if (!result) {
      missingRequiredFields.push({
        fieldId: field.id,
        label: field.label,
        type: field.type,
        reason: 'required_field_missing_execution_result',
      });
      continue;
    }

    if (result.status === 'success') {
      continue;
    }

    missingRequiredFields.push({
      fieldId: field.id,
      label: field.label,
      type: field.type,
      reason: `required_field_execution_${result.status}: ${result.message}`,
    });
  }

  return {
    ok: missingRequiredFields.length === 0,
    missingRequiredFields,
  };
}
