import { z } from 'zod';
import type { Page } from 'playwright';

import type { ExtendedProfile, JobRecord } from '@jobautomation/core';

import { createStagehandInstance, type StagehandInstance } from '../../stagehand/stagehand-client';
import { buildSystemPrompt, type JobContext } from './system-prompt-builder';

// ── TYPES ────────────────────────────────────────────────────────────────────

export type ApplyAgentConfig = {
  profile: ExtendedProfile;
  job: JobRecord;
  jobDescription: string;
  resumePath: string;
  coverLetterPath?: string | null;
  headless?: boolean;
  maxStepsPerPage?: number;
};

export type UnknownField = {
  label: string;
  required: boolean;
  fieldType: string;
};

export type StepResult = {
  stepName: string;
  fieldsFilled: number;
  unknownFields: UnknownField[];
};

export type ApplyAgentResult = {
  status: 'completed' | 'needs_review' | 'failed' | 'captcha_detected';
  jobUrl: string;
  applicationUrl: string;
  filledFields: string[];
  unknownFields: UnknownField[];
  steps: StepResult[];
  captchaDetected: boolean;
  timestamp: Date;
  error?: string;
};

// ── FIELD TYPE DETECTION ─────────────────────────────────────────────────────

const deterministicFields = new Set([
  'first name',
  'last name',
  'full name',
  'name',
  'email',
  'phone',
  'phone number',
  'location',
  'city',
  'linkedin',
  'linkedin url',
  'linkedin profile',
  'website',
  'portfolio',
  'personal website'
]);

function isDeterministicField(label: string): boolean {
  const normalized = label.toLowerCase().replace(/[*:]/g, '').trim();
  return deterministicFields.has(normalized);
}

function getDeterministicValue(label: string, profile: ExtendedProfile): string | null {
  const normalized = label.toLowerCase().replace(/[*:]/g, '').trim();
  const phone = `${profile.personal.phone.countryCode} ${profile.personal.phone.number}`;

  switch (normalized) {
    case 'first name':
      return profile.personal.fullName.split(/\s+/)[0] ?? '';
    case 'last name':
      return profile.personal.fullName.split(/\s+/).slice(1).join(' ');
    case 'full name':
    case 'name':
      return profile.personal.fullName;
    case 'email':
      return profile.personal.email;
    case 'phone':
    case 'phone number':
      return phone;
    case 'location':
    case 'city':
      return profile.personal.location;
    case 'linkedin':
    case 'linkedin url':
    case 'linkedin profile':
      return profile.personal.linkedin || null;
    case 'website':
    case 'portfolio':
    case 'personal website':
      return profile.personal.website || null;
    default:
      return null;
  }
}

// ── OBSERVATION SCHEMA ───────────────────────────────────────────────────────

const pageObservationSchema = z.object({
  fields: z.array(
    z.object({
      label: z.string(),
      selector: z.string(),
      type: z.enum(['text', 'select', 'radio', 'checkbox', 'textarea', 'file', 'unknown']),
      required: z.boolean(),
      filled: z.boolean()
    })
  ),
  hasNextButton: z.boolean(),
  hasSubmitButton: z.boolean(),
  currentStep: z.string().optional(),
  totalSteps: z.number().optional()
});

type PageObservation = z.infer<typeof pageObservationSchema>;

// ── MAIN AGENT ───────────────────────────────────────────────────────────────

export async function runApplyAgent(config: ApplyAgentConfig): Promise<ApplyAgentResult> {
  const {
    profile,
    job,
    jobDescription,
    resumePath,
    coverLetterPath,
    headless = true,
    maxStepsPerPage = 20
  } = config;

  const jobContext: JobContext = {
    country: job.location?.split(',').pop()?.trim() || 'Unknown',
    description: jobDescription
  };

  const systemPrompt = buildSystemPrompt({ profile, jobContext });
  const result: ApplyAgentResult = {
    status: 'completed',
    jobUrl: job.sourceUrl,
    applicationUrl: job.sourceUrl,
    filledFields: [],
    unknownFields: [],
    steps: [],
    captchaDetected: false,
    timestamp: new Date()
  };

  let stagehand: StagehandInstance | null = null;

  try {
    // 1. INIT
    stagehand = await createStagehandInstance({
      instructions: systemPrompt,
      localBrowserLaunchOptions: { headless }
    });

    const page = stagehand.page;
    if (!page) {
      throw new Error('Stagehand did not expose a browser page.');
    }

    // 2. NAVIGATE
    await page.goto(job.sourceUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');
    result.applicationUrl = page.url();

    let pageNumber = 0;
    let continueLoop = true;

    while (continueLoop && pageNumber < 10) {
      pageNumber++;
      const stepResult: StepResult = {
        stepName: `page_${pageNumber}`,
        fieldsFilled: 0,
        unknownFields: []
      };

      // 3. OBSERVE - identify all fields on current page
      let observation: PageObservation;
      try {
        observation = await stagehand.extract(
          `Analyze the current page and identify:
1. All visible form fields with their labels, selectors, types, required status, and fill status
2. Whether there is a "Next", "Continue", or similar navigation button
3. Whether there is a "Submit", "Apply", or final submission button
4. Current step indicator if visible (e.g., "Step 2 of 5")`,
          pageObservationSchema
        );
      } catch {
        // Fallback to simpler observation
        const rawObservations = await stagehand.observe(
          'Identify all form fields, buttons, and navigation elements on this page.'
        );
        observation = {
          fields: rawObservations.map((obs) => ({
            label: obs.description,
            selector: obs.selector,
            type: (obs.method === 'fill' ? 'text' : obs.method === 'click' ? 'radio' : 'unknown') as PageObservation['fields'][number]['type'],
            required: obs.description.includes('*'),
            filled: false
          })),
          hasNextButton: rawObservations.some((obs) =>
            /next|continue|proceed/i.test(obs.description)
          ),
          hasSubmitButton: rawObservations.some((obs) =>
            /submit|apply now|send application/i.test(obs.description)
          )
        };
      }

      // Check for CAPTCHA
      const pageContent = await page.content();
      if (/captcha|recaptcha|hcaptcha|challenge/i.test(pageContent)) {
        result.captchaDetected = true;
        result.status = 'captcha_detected';
        result.error = 'CAPTCHA_DETECTED';
        break;
      }

      // 4. PLAYWRIGHT - fill deterministic fields
      for (const field of observation.fields) {
        if (field.filled) continue;

        if (field.type === 'file') {
          // Handle file uploads with Playwright directly
          const isResume = /resume|cv/i.test(field.label);
          const isCoverLetter = /cover letter/i.test(field.label);

          if (isResume && resumePath) {
            try {
              const fileInput = page.locator(field.selector);
              await fileInput.setInputFiles(resumePath);
              result.filledFields.push(field.label);
              stepResult.fieldsFilled++;
            } catch (err) {
              console.warn(`Failed to upload resume: ${err}`);
            }
          } else if (isCoverLetter && coverLetterPath) {
            try {
              const fileInput = page.locator(field.selector);
              await fileInput.setInputFiles(coverLetterPath);
              result.filledFields.push(field.label);
              stepResult.fieldsFilled++;
            } catch (err) {
              console.warn(`Failed to upload cover letter: ${err}`);
            }
          }
          continue;
        }

        if (isDeterministicField(field.label)) {
          const value = getDeterministicValue(field.label, profile);
          if (value) {
            try {
              await page.fill(field.selector, value);
              result.filledFields.push(field.label);
              stepResult.fieldsFilled++;
            } catch {
              // Fall through to Stagehand
            }
          }
          continue;
        }

        // 5. STAGEHAND page.act() - ambiguous fields
        try {
          const actResult = await stagehand.act(
            `Fill the form field labeled "${field.label}" using the candidate profile context. 
If this is a dropdown or radio button, select the most appropriate option.
If unsure, report UNKNOWN_FIELD.`
          );

          if (actResult.success) {
            result.filledFields.push(field.label);
            stepResult.fieldsFilled++;
          } else {
            if (field.required) {
              stepResult.unknownFields.push({
                label: field.label,
                required: true,
                fieldType: field.type
              });
            }
          }
        } catch (err) {
          console.warn(`Stagehand act failed for ${field.label}: ${err}`);
          if (field.required) {
            stepResult.unknownFields.push({
              label: field.label,
              required: true,
              fieldType: field.type
            });
          }
        }
      }

      result.steps.push(stepResult);
      result.unknownFields.push(...stepResult.unknownFields);

      // 7. EXTRACT TO VERIFY
      await page.waitForLoadState('networkidle');

      // 9. FINAL PAGE DETECTION
      if (observation.hasSubmitButton) {
        // STOP - do not click submit
        result.status = result.unknownFields.length > 0 ? 'needs_review' : 'completed';
        continueLoop = false;
        break;
      }

      // 8. ADVANCE to next page
      if (observation.hasNextButton) {
        try {
          await stagehand.act('Click the Next or Continue button to proceed to the next step.');
          await page.waitForLoadState('networkidle');
        } catch {
          continueLoop = false;
        }
      } else {
        continueLoop = false;
      }
    }

    if (result.unknownFields.length > 0) {
      result.status = 'needs_review';
    }
  } catch (error) {
    result.status = 'failed';
    result.error = error instanceof Error ? error.message : String(error);
  } finally {
    // 10. TEARDOWN
    if (stagehand) {
      await stagehand.close().catch(() => {});
    }
  }

  return result;
}

// ── STEP-BY-STEP AGENT (for more control) ────────────────────────────────────

export type ApplyAgentStep = {
  stagehand: StagehandInstance;
  page: Page;
  profile: ExtendedProfile;
  systemPrompt: string;
};

export async function initApplyAgent(config: {
  profile: ExtendedProfile;
  job: JobRecord;
  jobDescription: string;
  headless?: boolean;
}): Promise<ApplyAgentStep> {
  const jobContext: JobContext = {
    country: config.job.location?.split(',').pop()?.trim() || 'Unknown',
    description: config.jobDescription
  };

  const systemPrompt = buildSystemPrompt({ profile: config.profile, jobContext });

  const stagehand = await createStagehandInstance({
    instructions: systemPrompt,
    localBrowserLaunchOptions: { headless: config.headless ?? true }
  });

  return {
    stagehand,
    page: stagehand.page,
    profile: config.profile,
    systemPrompt
  };
}

export async function navigateToJob(step: ApplyAgentStep, url: string): Promise<void> {
  await step.page.goto(url, { waitUntil: 'domcontentloaded' });
  await step.page.waitForLoadState('networkidle');
}

export async function fillDeterministicFields(
  step: ApplyAgentStep,
  fields: Array<{ label: string; selector: string }>
): Promise<string[]> {
  const filled: string[] = [];

  for (const field of fields) {
    const value = getDeterministicValue(field.label, step.profile);
    if (value) {
      try {
        await step.page.fill(field.selector, value);
        filled.push(field.label);
      } catch {
        // Skip failed fields
      }
    }
  }

  return filled;
}

export async function uploadFiles(
  step: ApplyAgentStep,
  resumePath: string,
  coverLetterPath?: string | null
): Promise<void> {
  // Find resume input
  const resumeInput = step.page.locator('input[type="file"][name*="resume"], input[type="file"][id*="resume"]').first();
  if ((await resumeInput.count()) > 0) {
    await resumeInput.setInputFiles(resumePath);
  }

  // Find cover letter input
  if (coverLetterPath) {
    const coverInput = step.page.locator('input[type="file"][name*="cover"], input[type="file"][id*="cover"]').first();
    if ((await coverInput.count()) > 0) {
      await coverInput.setInputFiles(coverLetterPath);
    }
  }
}

export async function fillAmbiguousField(
  step: ApplyAgentStep,
  label: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const result = await step.stagehand.act(
      `Fill the form field labeled "${label}" using the candidate profile context.`
    );
    return { success: result.success, error: result.message };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function closeApplyAgent(step: ApplyAgentStep): Promise<void> {
  await step.stagehand.close();
}
