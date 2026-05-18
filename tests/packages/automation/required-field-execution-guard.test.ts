import { describe, expect, test } from 'vitest';

import type { ApplicationArtifacts } from '../../../packages/automation/src/apply/contracts';
import {
  validateRequiredFieldExecution,
  type RequiredFieldExecutionGuardResult,
} from '../../../packages/automation/src/apply/required-field-execution-guard';
import type { ExecuteApplicationFillPlanResult } from '../../../packages/automation/src/apply/fill-plan-executor';
import type { ScrapedApplicationField } from '../../../packages/automation/src/apply/form-scraper';
import type { ApplicationFillPlanEntry } from '../../../packages/automation/src/apply/openrouter-answer-module';

describe('required field execution guard', () => {
  test('passes when required fields are filled successfully', () => {
    const result = validateRequiredFieldExecution({
      fields: [requiredTextField('first_name', 'First Name')],
      fillPlan: [fillEntry('first_name', 'Taylor')],
      executionResult: executionResult([
        {
          fieldId: 'first_name',
          label: 'First Name',
          action: 'fill',
          status: 'success',
          message: 'Filled field.',
        },
      ]),
    });

    expect(result).toEqual<RequiredFieldExecutionGuardResult>({
      ok: true,
      missingRequiredFields: [],
    });
  });

  test('fails when a required field is skipped during execution', () => {
    const result = validateRequiredFieldExecution({
      fields: [requiredTextField('first_name', 'First Name')],
      fillPlan: [fillEntry('first_name', 'Taylor')],
      executionResult: executionResult([
        {
          fieldId: 'first_name',
          label: 'First Name',
          action: 'skip',
          status: 'skipped',
          message: 'Field was skipped by fill plan.',
        },
      ]),
    });

    expect(result.ok).toBe(false);
    expect(result.missingRequiredFields).toEqual([
      {
        fieldId: 'first_name',
        label: 'First Name',
        type: 'text',
        reason: 'required_field_execution_skipped: Field was skipped by fill plan.',
      },
    ]);
  });

  test('fails when a required field fails during execution', () => {
    const result = validateRequiredFieldExecution({
      fields: [requiredTextField('first_name', 'First Name')],
      fillPlan: [fillEntry('first_name', 'Taylor')],
      executionResult: executionResult([
        {
          fieldId: 'first_name',
          label: 'First Name',
          action: 'fill',
          status: 'failed',
          message: '#first_name: not visible',
        },
      ]),
    });

    expect(result.ok).toBe(false);
    expect(result.missingRequiredFields).toEqual([
      {
        fieldId: 'first_name',
        label: 'First Name',
        type: 'text',
        reason: 'required_field_execution_failed: #first_name: not visible',
      },
    ]);
  });

  test('ignores optional skipped and failed fields', () => {
    const result = validateRequiredFieldExecution({
      fields: [optionalTextField('middle_name', 'Middle Name')],
      fillPlan: [fillEntry('middle_name', 'Taylor')],
      executionResult: executionResult([
        {
          fieldId: 'middle_name',
          label: 'Middle Name',
          action: 'fill',
          status: 'failed',
          message: '#middle_name: not visible',
        },
      ]),
    });

    expect(result).toEqual<RequiredFieldExecutionGuardResult>({
      ok: true,
      missingRequiredFields: [],
    });
  });

  test('fails required file fields when the matching artifact is missing', () => {
    const result = validateRequiredFieldExecution({
      fields: [
        {
          ...requiredTextField('resume', 'Resume'),
          type: 'file',
          specialHandling: 'file_upload',
        },
      ],
      fillPlan: [
        {
          ...fillEntry('resume', null),
          action: 'skip',
          skipReason: 'file_upload_handled_later',
        },
      ],
      artifacts: {
        resume: null,
        coverLetter: null,
      } satisfies ApplicationArtifacts,
      executionResult: executionResult([]),
    });

    expect(result.ok).toBe(false);
    expect(result.missingRequiredFields).toEqual([
      {
        fieldId: 'resume',
        label: 'Resume',
        type: 'file',
        reason: 'required_file_missing_artifact:resume',
      },
    ]);
  });
});

function requiredTextField(id: string, label: string): ScrapedApplicationField {
  return {
    id,
    label,
    type: 'text',
    required: true,
    requiredSources: ['html_required'],
    visible: true,
    enabled: true,
    selectorCandidates: [`#${id}`],
    options: [],
  };
}

function optionalTextField(id: string, label: string): ScrapedApplicationField {
  return {
    ...requiredTextField(id, label),
    required: false,
    requiredSources: [],
  };
}

function fillEntry(
  fieldId: string,
  value: ApplicationFillPlanEntry['value']
): ApplicationFillPlanEntry {
  return {
    fieldId,
    action: 'fill',
    value,
    selectedOptionValue: null,
    selectedOptionLabel: null,
    searchText: null,
    evidenceMode: 'direct_profile',
    evidenceRefs: [],
    confidence: 1,
    skipReason: '',
  };
}

function executionResult(
  results: ExecuteApplicationFillPlanResult['results']
): ExecuteApplicationFillPlanResult {
  return {
    results,
    summary: {
      total: results.length,
      success: results.filter((result) => result.status === 'success').length,
      skipped: results.filter((result) => result.status === 'skipped').length,
      failed: results.filter((result) => result.status === 'failed').length,
    },
    telemetry: {
      totalPreFillDwellMs: 0,
      totalTypingDurationMs: 0,
      totalPointerActions: 0,
      forbiddenDirectApiUsage: [],
    },
  };
}
