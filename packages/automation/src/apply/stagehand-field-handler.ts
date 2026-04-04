import type { Page } from 'playwright';
import type { ExtendedProfile } from '@jobautomation/core';

import { createStagehandInstance, type StagehandInstance } from '../stagehand/stagehand-client';
import {
  buildFieldInstruction,
  buildSystemPrompt,
  type JobContext
} from './stagehand/system-prompt-builder';

export type StagehandTargetField = {
  label: string;
  selector: string | null;
  controlType: string;
};

export type StagehandFieldResult = {
  fieldLabel: string;
  success: boolean;
  action?: string;
  error?: string;
};

function resolveFieldType(controlType: string): 'text' | 'select' | 'radio' | 'checkbox' | 'textarea' {
  const normalized = controlType.toLowerCase();

  if (normalized.includes('select') || normalized.includes('dropdown')) {
    return 'select';
  }

  if (normalized.includes('radio')) {
    return 'radio';
  }

  if (normalized.includes('checkbox')) {
    return 'checkbox';
  }

  if (normalized.includes('textarea')) {
    return 'textarea';
  }

  return 'text';
}

export async function attemptStagehandFieldFill(input: {
  page: Page;
  targetFields: StagehandTargetField[];
  profile: ExtendedProfile;
  jobContext: JobContext;
  cdpUrl?: string;
  maxAttempts?: number;
}): Promise<StagehandFieldResult[]> {
  const results: StagehandFieldResult[] = [];
  const maxAttempts = input.maxAttempts ?? 2;

  if (input.targetFields.length === 0) {
    return results;
  }

  if (!input.cdpUrl) {
    return input.targetFields.map((field) => ({
      fieldLabel: field.label,
      success: false,
      error: 'Stagehand could not attach to the active browser session (missing CDP URL).'
    }));
  }

  let stagehand: StagehandInstance | null = null;

  try {
    const instructions = buildSystemPrompt({
      profile: input.profile,
      jobContext: input.jobContext
    });
    stagehand = await createStagehandInstance({
      instructions,
      localBrowserLaunchOptions: {
        cdpUrl: input.cdpUrl
      }
    });

    for (const field of input.targetFields) {
      let success = false;
      let lastError: string | undefined;
      let action: string | undefined;
      const fieldType = resolveFieldType(field.controlType);

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const instruction = `${buildFieldInstruction(field.label, fieldType, input.profile)}
Only act on the field labeled "${field.label}".
Use the current page state exactly as provided and do not navigate away.
If the field is optional and uncertain, leave it unchanged.`;

          const actResult = await stagehand.act(instruction, {
            page: input.page
          });

          if (actResult.success) {
            success = true;
            action = actResult.action ?? fieldType;
            break;
          } else {
            lastError = actResult.message ?? 'Unknown act() failure';
          }
        } catch (error) {
          lastError = error instanceof Error ? error.message : String(error);
          if (attempt < maxAttempts) {
            await new Promise((r) => setTimeout(r, 500 * attempt));
          }
        }
      }

      results.push({
        fieldLabel: field.label,
        success,
        ...(action ? { action } : {}),
        ...(!success && lastError ? { error: lastError } : {})
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return input.targetFields.map((field) => ({
      fieldLabel: field.label,
      success: false,
      error: `Stagehand session failed: ${message}`
    }));
  } finally {
    if (stagehand) {
      await stagehand.close().catch(() => {});
    }
  }

  return results;
}

export type StagehandFieldHandlerResult = {
  attempted: number;
  succeeded: number;
  failed: number;
  results: StagehandFieldResult[];
};

export async function runStagehandFieldHandler(input: {
  page: Page;
  targetFields: StagehandTargetField[];
  profile: ExtendedProfile;
  jobContext: JobContext;
  cdpUrl?: string;
}): Promise<StagehandFieldHandlerResult> {
  const results = await attemptStagehandFieldFill(input);

  return {
    attempted: results.length,
    succeeded: results.filter((r) => r.success).length,
    failed: results.filter((r) => !r.success).length,
    results
  };
}
