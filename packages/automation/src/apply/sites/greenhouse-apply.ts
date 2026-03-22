import type { Page } from 'playwright';

import type { SupportedApplicationSite } from '../contracts';
import { uploadArtifactFile } from '../file-upload';
import type {
  ApplyFieldStep,
  ApplyStopBeforeSubmitStep,
  ApplyUploadStep
} from './shared/form-step';

export type GreenhouseApplicant = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  resumePath: string;
};

export type GreenhouseApplyHelpers = {
  mapField: (step: ApplyFieldStep) => Promise<void>;
  uploadFile: (step: ApplyUploadStep) => Promise<void>;
  stopBeforeSubmit: (step: ApplyStopBeforeSubmitStep) => Promise<void>;
};

export type GreenhouseApplyResult = {
  sourceUrl: string;
  applicationUrl: string;
  finalReviewUrl: string;
  stoppedBeforeSubmit: true;
};

const greenhouseSelectors = {
  applyButton: 'a#apply_button',
  firstName: 'input#first_name',
  lastName: 'input#last_name',
  email: 'input#email',
  phone: 'input#phone',
  resume: 'input#resume',
  continueToReview: 'button#continue_to_review',
  submitButton: 'button#submit_application',
  finalReviewReady: '[data-final-review-ready]'
} as const;

async function fillRequiredFields(page: Page, applicant: GreenhouseApplicant, helpers: GreenhouseApplyHelpers) {
  const steps: ApplyFieldStep[] = [
    {
      name: 'first_name',
      kind: 'field',
      selector: greenhouseSelectors.firstName,
      value: applicant.firstName
    },
    {
      name: 'last_name',
      kind: 'field',
      selector: greenhouseSelectors.lastName,
      value: applicant.lastName
    },
    {
      name: 'email',
      kind: 'field',
      selector: greenhouseSelectors.email,
      value: applicant.email
    },
    {
      name: 'phone',
      kind: 'field',
      selector: greenhouseSelectors.phone,
      value: applicant.phone
    }
  ];

  for (const step of steps) {
    await page.locator(step.selector).waitFor({ state: 'visible' });
    await helpers.mapField(step);
  }
}

export async function runGreenhouseApply(input: {
  page: Page;
  sourceUrl: string;
  applicant: GreenhouseApplicant;
  helpers: GreenhouseApplyHelpers;
}): Promise<GreenhouseApplyResult> {
  if (!input.page.url() || input.page.url() !== input.sourceUrl) {
    await input.page.goto(input.sourceUrl, {
      waitUntil: 'domcontentloaded'
    });
  }

  await input.page.locator(greenhouseSelectors.applyButton).waitFor({ state: 'visible' });
  await Promise.all([
    input.page.waitForURL('**/apply', { timeout: 10000 }),
    input.page.locator(greenhouseSelectors.applyButton).click()
  ]);

  await fillRequiredFields(input.page, input.applicant, input.helpers);
  await input.helpers.uploadFile({
    name: 'resume',
    kind: 'upload',
    selector: greenhouseSelectors.resume,
    filePath: input.applicant.resumePath
  });

  await Promise.all([
    input.page.waitForURL('**/review', { timeout: 10000 }),
    input.page.locator(greenhouseSelectors.continueToReview).click()
  ]);

  await input.page.locator(greenhouseSelectors.finalReviewReady).waitFor({ state: 'visible' });
  await input.helpers.stopBeforeSubmit({
    name: 'final_review',
    kind: 'stop',
    selector: greenhouseSelectors.submitButton
  });

  return {
    sourceUrl: input.sourceUrl,
    applicationUrl: input.page.url().replace(/\/review$/, '/apply'),
    finalReviewUrl: input.page.url(),
    stoppedBeforeSubmit: true
  };
}

export const greenhouseApplicationSite: SupportedApplicationSite = {
  siteKey: 'greenhouse',
  supports(job) {
    return job.sourceKind === 'greenhouse';
  },
  async run(context) {
    const resume = context.artifacts.resume;
    if (!resume) {
      throw new Error('A resume PDF artifact is required for Greenhouse application automation.');
    }
    let pausedRun = null;

    await context.logStep('open_source_posting', 'Opened Greenhouse source posting.');

    await runGreenhouseApply({
      page: context.session.page,
      sourceUrl: context.job.sourceUrl,
      applicant: {
        firstName: context.fieldMapping.firstName ?? '',
        lastName: context.fieldMapping.lastName ?? '',
        email: context.fieldMapping.email ?? '',
        phone: context.fieldMapping.phone ?? '',
        resumePath: resume.storagePath
      },
      helpers: {
        mapField: async (step) => {
          await context.logStep(step.name, `Filled ${step.name.replace(/_/g, ' ')}.`, {
            selector: step.selector
          });
          await context.session.page.locator(step.selector).fill(step.value);
        },
        uploadFile: async (step) => {
          await context.logStep(step.name, 'Uploaded resume artifact.', {
            selector: step.selector,
            artifactId: resume.id
          });
          await uploadArtifactFile({
            artifact: resume,
            page: context.session.page,
            selector: step.selector,
            required: true
          });
        },
        stopBeforeSubmit: async (step) => {
          await context.logStep(step.name, 'Reached final review and stopping before submit.', {
            selector: step.selector
          });
          pausedRun = await context.stopBeforeSubmit({
            step: 'final_review',
            reviewUrl: context.session.page.url()
          });
        }
      }
    });

    if (!pausedRun) {
      throw new Error('Greenhouse apply flow did not reach the shared stop-before-submit guard.');
    }

    return pausedRun;
  }
};
