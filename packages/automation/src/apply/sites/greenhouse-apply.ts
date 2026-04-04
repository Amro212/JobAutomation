import type { Locator, Page } from 'playwright';

import {
  defaultExtendedProfile,
  parseWorkAuthorizationCountriesCsv,
  type ExtendedProfile,
  type MinimalAutofillProfile
} from '@jobautomation/core';

import {
  classifyApplicationQuestionLabel,
  resolveAutofillAnswer,
  type AutofillProfileContext
} from '../autofill-question-map';
import type { SupportedApplicationSite } from '../contracts';
import { uploadArtifactFile } from '../file-upload';
import {
  runStagehandFieldHandler,
  type StagehandTargetField,
  type StagehandFieldHandlerResult
} from '../stagehand-field-handler';
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
  coverLetterPath?: string | null;
  preferredFirstName?: string | null;
  linkedinUrl?: string | null;
  websiteUrl?: string | null;
  location?: string | null;
  country?: string | null;
  autofillProfile?: MinimalAutofillProfile | null;
  extendedProfile?: ExtendedProfile | null;
  profileContext?: {
    summary: string;
    reusableContext: string;
  };
  jobDescription?: string | null;
};

export type GreenhouseRequiredFieldClassification =
  | 'filled'
  | 'skipped_optional'
  | 'blocked_unknown_required'
  | 'blocked_missing_profile_data';

type GreenhouseRequiredFieldSnapshot = {
  label: string;
  selector: string | null;
  controlType: string;
  filled: boolean;
  required: boolean;
};

export type GreenhouseApplyHelpers = {
  mapField: (step: ApplyFieldStep) => Promise<void>;
  uploadFile: (step: ApplyUploadStep) => Promise<void>;
  stopBeforeSubmit: (
    step: ApplyStopBeforeSubmitStep & {
      details?: Record<string, unknown>;
    }
  ) => Promise<void>;
  captureScreenshot?: (input: {
    step: string;
    message: string;
    details?: Record<string, unknown>;
  }) => Promise<{ artifactId: string; storagePath: string }>;
  logRequiredField?: (input: {
    label: string;
    selector: string | null;
    controlType: string;
    filled: boolean;
    required: boolean;
    classification: GreenhouseRequiredFieldClassification;
  }) => Promise<void>;
  logStagehandAutomation?: (input: {
    result: StagehandFieldHandlerResult;
  }) => Promise<void>;
};

export type GreenhouseApplyResult = {
  sourceUrl: string;
  applicationUrl: string;
  finalReviewUrl: string;
  pageMode: 'hosted-inline';
  stoppedBeforeSubmit: boolean;
  submitted: boolean;
  stagehandAutomation?: {
    attempted: number;
    succeeded: number;
    failed: number;
  };
};

const greenhouseSelectors = {
  firstName: ['input#first_name'],
  lastName: ['input#last_name'],
  preferredFirstName: ['input#preferred_name', 'input#preferred_first_name'],
  email: ['input#email'],
  country: ['input#country'],
  phone: ['input#phone'],
  location: ['input#location', 'input#auto_complete_input'],
  resume: ['input#resume'],
  coverLetter: ['input#cover_letter'],
  submitButton: ['button[type="submit"]']
} as const;

const coreFieldLabels = {
  linkedin: ['LinkedIn Profile', 'LinkedIn'],
  website: ['Website', 'Personal Website', 'Portfolio', 'Portfolio Website']
} as const;

const missingProfileQuestionPatterns = [
  /work authorization/i,
  /sponsor/i,
  /visa/i,
  /export control/i,
  /clearance/i,
  /conflict of interest/i,
  /history with/i,
  /how did you hear/i,
  /referral/i,
  /onsite/i,
  /on-site/i,
  /citizenship/i,
  /legally authorized/i
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeLabel(value: string): string {
  return value.replace(/\*/g, '').replace(/\s+/g, ' ').trim();
}

function normalizeForComparison(value: string): string {
  return normalizeLabel(value).toLowerCase();
}

async function locatorExists(locator: Locator): Promise<boolean> {
  return (await locator.count()) > 0;
}

async function locatorVisible(locator: Locator): Promise<boolean> {
  if (!(await locatorExists(locator))) {
    return false;
  }

  return locator.first().isVisible().catch(() => false);
}

async function buildSelector(locator: Locator): Promise<string | null> {
  const id = await locator.first().getAttribute('id');
  if (id) {
    return `#${id}`;
  }

  const name = await locator.first().getAttribute('name');
  if (name) {
    return `[name="${name}"]`;
  }

  const ariaLabel = await locator.first().getAttribute('aria-label');
  if (ariaLabel) {
    return `[aria-label="${ariaLabel}"]`;
  }

  return null;
}

async function findVisibleSelector(page: Page, selectors: readonly string[]): Promise<string | null> {
  for (const selector of selectors) {
    if (await locatorVisible(page.locator(selector))) {
      return selector;
    }
  }

  return null;
}

async function findLabeledSelector(page: Page, labels: readonly string[]): Promise<string | null> {
  for (const label of labels) {
    const locator = page.getByLabel(new RegExp(`^${escapeRegExp(label)}`, 'i')).first();
    if (await locatorVisible(locator)) {
      return buildSelector(locator);
    }
  }

  return null;
}

async function fillFieldIfVisible(input: {
  page: Page;
  helpers: GreenhouseApplyHelpers;
  name: string;
  value: string | null | undefined;
  selectors?: readonly string[];
  labels?: readonly string[];
}): Promise<string | null> {
  const value = input.value?.trim();
  if (!value) {
    return null;
  }

  const selector =
    (input.selectors ? await findVisibleSelector(input.page, input.selectors) : null) ??
    (input.labels ? await findLabeledSelector(input.page, input.labels) : null);

  if (!selector) {
    return null;
  }

  await input.helpers.mapField({
    name: input.name,
    kind: 'field',
    selector,
    value
  });

  return selector;
}

async function uploadFileIfVisible(input: {
  page: Page;
  helpers: GreenhouseApplyHelpers;
  name: string;
  filePath?: string | null;
  selectors: readonly string[];
}): Promise<string | null> {
  if (!input.filePath?.trim()) {
    return null;
  }

  const selector = await findVisibleSelector(input.page, input.selectors);
  if (!selector) {
    return null;
  }

  await input.helpers.uploadFile({
    name: input.name,
    kind: 'upload',
    selector,
    filePath: input.filePath
  });

  return selector;
}

async function ensureHostedInlineApplicationForm(page: Page): Promise<void> {
  const firstName = page.locator(greenhouseSelectors.firstName[0]).first();
  if (await locatorVisible(firstName)) {
    return;
  }

  const applyButton = page.getByRole('button', { name: /^Apply$/i }).first();
  const applyLink = page.getByRole('link', { name: /^Apply/i }).first();
  const trigger =
    (await locatorVisible(applyButton)) ? applyButton : (await locatorVisible(applyLink)) ? applyLink : null;

  if (!trigger) {
    throw new Error('Greenhouse hosted application form was not visible and no Apply trigger was found.');
  }

  await trigger.click();
  await firstName.waitFor({ state: 'visible', timeout: 10000 });
}

async function selectCountryIfVisible(input: {
  page: Page;
  helpers: GreenhouseApplyHelpers;
  country: string | null | undefined;
}): Promise<string | null> {
  const country = input.country?.trim();
  if (!country) {
    return null;
  }

  const selector = await findVisibleSelector(input.page, greenhouseSelectors.country);
  if (!selector) {
    return null;
  }

  await input.helpers.mapField({
    name: 'country',
    kind: 'field',
    selector,
    value: country
  });

  const countryField = input.page.locator(selector).first();
  const option = input.page.getByRole('option', {
    name: new RegExp(`^${escapeRegExp(country)}\\b`, 'i')
  }).first();

  if (await locatorVisible(option)) {
    await option.click();
    return selector;
  }

  await countryField.press('Enter').catch(() => undefined);
  return selector;
}

async function findSubmitButton(page: Page): Promise<{ selector: string; locator: Locator } | null> {
  const locator = page.getByRole('button', { name: /submit application/i }).first();
  if (await locatorVisible(locator)) {
    return {
      selector: (await buildSelector(locator)) ?? greenhouseSelectors.submitButton[0],
      locator
    };
  }

  const selector = await findVisibleSelector(page, greenhouseSelectors.submitButton);
  if (!selector) {
    return null;
  }

  return {
    selector,
    locator: page.locator(selector).first()
  };
}

async function collectFormFields(
  page: Page,
  options?: { requiredOnly?: boolean }
): Promise<GreenhouseRequiredFieldSnapshot[]> {
  const fieldLocators = page.locator('input, select, textarea');
  const fieldCount = await fieldLocators.count();
  const seenRadioNames = new Set<string>();
  const fields: GreenhouseRequiredFieldSnapshot[] = [];

  for (let index = 0; index < fieldCount; index += 1) {
    const field = fieldLocators.nth(index);
    if (!(await locatorVisible(field))) {
      continue;
    }

    const inputType = (await field.getAttribute('type'))?.toLowerCase() ?? null;
    if (inputType === 'hidden' || inputType === 'submit' || inputType === 'button' || inputType === 'search') {
      continue;
    }

    const fieldName = (await field.getAttribute('name')) ?? '';
    if (inputType === 'radio') {
      if (!fieldName || seenRadioNames.has(fieldName)) {
        continue;
      }
      seenRadioNames.add(fieldName);
    }

    const fieldId = (await field.getAttribute('id')) ?? '';
    const ariaLabel = (await field.getAttribute('aria-label')) ?? '';
    const ariaLabelledBy = (await field.getAttribute('aria-labelledby')) ?? '';
    let rawLabel = ariaLabel.trim();

    if (!rawLabel && ariaLabelledBy) {
      const labelIds = ariaLabelledBy.split(/\s+/).filter(Boolean);
      const parts: string[] = [];

      for (const labelId of labelIds) {
        const text = await page.locator(`[id="${labelId}"]`).first().textContent().catch(() => null);
        if (text?.trim()) {
          parts.push(text.trim());
        }
      }

      rawLabel = parts.join(' ').trim();
    }

    if (!rawLabel && fieldId) {
      rawLabel =
        (await page
          .locator(`label[for="${fieldId}"]`)
          .first()
          .textContent()
          .catch(() => null)) ?? '';
    }

    const label = normalizeLabel(rawLabel);
    if (!label) {
      continue;
    }

    const explicitRequired =
      (await field.getAttribute('aria-required')) === 'true' ||
      (await field.getAttribute('required')) !== null;
    const required = explicitRequired || /\*/.test(rawLabel);
    const requiredOnly = options?.requiredOnly ?? true;
    if (requiredOnly && !required) {
      continue;
    }

    let filled = false;
    if (inputType === 'radio' && fieldName) {
      filled = (await page.locator(`input[type="radio"][name="${fieldName}"]:checked`).count()) > 0;
    } else if (inputType === 'checkbox') {
      filled = await field.isChecked().catch(() => false);
    } else {
      const value = await field.inputValue().catch(() => '');
      filled = value.trim().length > 0;
    }

    fields.push({
      label,
      selector: await buildSelector(field),
      controlType: inputType ?? (await field.getAttribute('role')) ?? 'input',
      filled,
      required
    });
  }

  return fields;
}

function resolveExpectedApplicantValue(
  label: string,
  applicant: GreenhouseApplicant
): string | null | undefined {
  const normalized = normalizeForComparison(label);

  if (normalized.startsWith('first name')) {
    return applicant.firstName;
  }

  if (normalized.startsWith('last name')) {
    return applicant.lastName;
  }

  if (normalized.startsWith('preferred first name')) {
    return applicant.preferredFirstName ?? applicant.firstName;
  }

  if (normalized.startsWith('email')) {
    return applicant.email;
  }

  if (normalized === 'country') {
    return applicant.country ?? null;
  }

  if (normalized.startsWith('phone')) {
    return applicant.phone;
  }

  if (normalized.startsWith('linkedin profile') || normalized === 'linkedin') {
    return applicant.linkedinUrl ?? null;
  }

  if (normalized.startsWith('website') || normalized.includes('portfolio')) {
    return applicant.websiteUrl ?? null;
  }

  if (normalized.startsWith('location')) {
    return applicant.location ?? null;
  }

  return undefined;
}

function classifyRequiredField(
  field: GreenhouseRequiredFieldSnapshot,
  applicant: GreenhouseApplicant
): GreenhouseRequiredFieldClassification {
  if (field.filled) {
    return 'filled';
  }

  const expectedValue = resolveExpectedApplicantValue(field.label, applicant);
  if (expectedValue !== undefined) {
    return expectedValue && expectedValue.trim().length > 0
      ? 'blocked_unknown_required'
      : 'blocked_missing_profile_data';
  }

  const category = classifyApplicationQuestionLabel(field.label);
  const autofillCtx = buildAutofillContext(applicant);
  if (autofillCtx && resolveAutofillAnswer(category, autofillCtx) !== null) {
    return 'blocked_unknown_required';
  }

  if (missingProfileQuestionPatterns.some((pattern) => pattern.test(field.label))) {
    return 'blocked_missing_profile_data';
  }

  return 'blocked_unknown_required';
}

function buildAutofillContext(applicant: GreenhouseApplicant): AutofillProfileContext | null {
  if (!applicant.autofillProfile) {
    return null;
  }
  return {
    autofill: applicant.autofillProfile,
    summary: applicant.profileContext?.summary ?? '',
    reusableContext: applicant.profileContext?.reusableContext ?? ''
  };
}

function autofillStepSlug(label: string): string {
  const slug = normalizeForComparison(label).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  return (slug.length > 0 ? slug : 'autofill').slice(0, 72);
}

async function tryAutofillLabeledField(input: {
  page: Page;
  helpers: GreenhouseApplyHelpers;
  label: string;
  value: string;
  selectorHint: string | null;
}): Promise<boolean> {
  const snippet = normalizeLabel(input.label).slice(0, 160);
  if (!snippet) {
    return false;
  }

  const labelPattern = new RegExp(
    snippet
      .split(/\s+/)
      .map((word) => escapeRegExp(word))
      .join('\\s+'),
    'i'
  );

  let locator = input.page.getByLabel(labelPattern).first();
  if (!(await locatorVisible(locator)) && input.selectorHint) {
    locator = input.page.locator(input.selectorHint).first();
  }

  if (!(await locatorVisible(locator))) {
    return false;
  }

  const selector = (await buildSelector(locator)) ?? input.selectorHint;
  if (!selector) {
    return false;
  }

  await input.helpers.mapField({
    name: `autofill_${autofillStepSlug(input.label)}`,
    kind: 'field',
    selector,
    value: input.value
  });

  return true;
}

async function runDeterministicAutofillPass(input: {
  page: Page;
  helpers: GreenhouseApplyHelpers;
  applicant: GreenhouseApplicant;
}): Promise<void> {
  const ctx = buildAutofillContext(input.applicant);
  if (!ctx) {
    return;
  }

  const fields = await collectFormFields(input.page, { requiredOnly: true });
  for (const field of fields) {
    if (field.filled) {
      continue;
    }
    if (resolveExpectedApplicantValue(field.label, input.applicant) !== undefined) {
      continue;
    }

    const category = classifyApplicationQuestionLabel(field.label);
    const value = resolveAutofillAnswer(category, ctx);
    if (!value?.trim()) {
      continue;
    }

    await tryAutofillLabeledField({
      page: input.page,
      helpers: input.helpers,
      label: field.label,
      value: value.trim(),
      selectorHint: field.selector
    });
  }
}

function requiredFieldMessage(classification: GreenhouseRequiredFieldClassification, label: string): string {
  switch (classification) {
    case 'filled':
      return `Greenhouse required field ready: ${label}.`;
    case 'blocked_missing_profile_data':
      return `Greenhouse required field needs manual review because applicant data is unavailable: ${label}.`;
    case 'blocked_unknown_required':
      return `Greenhouse required field needs manual review because automation cannot deterministically answer it: ${label}.`;
    default:
      return `Greenhouse optional field was skipped: ${label}.`;
  }
}

function parsePhoneNumber(value: string): ExtendedProfile['personal']['phone'] {
  const match = value.match(/^(\+\d{1,3})\s*(.*)$/);
  if (match) {
    return {
      countryCode: match[1] ?? '+1',
      number: match[2] ?? ''
    };
  }

  return {
    countryCode: '+1',
    number: value
  };
}

function mapRequiresVisaSponsorship(
  value: MinimalAutofillProfile['requiresSponsorship']
): boolean | null {
  if (value === 'yes') {
    return true;
  }

  if (value === 'no') {
    return false;
  }

  return null;
}

function mapWillingToRelocate(value: MinimalAutofillProfile['relocation']): boolean | null {
  if (value === 'yes') {
    return true;
  }

  if (value === 'no') {
    return false;
  }

  return null;
}

function mapSecurityClearance(
  value: MinimalAutofillProfile['clearanceStatus']
): ExtendedProfile['autofill']['securityClearance'] {
  if (value === 'none') {
    return 'None / never held';
  }

  return '';
}

function buildStagehandProfile(applicant: GreenhouseApplicant): ExtendedProfile | null {
  const fullName = `${applicant.firstName} ${applicant.lastName}`.trim();
  if (!fullName || !applicant.email.trim()) {
    return null;
  }

  const seed = applicant.extendedProfile ?? defaultExtendedProfile;
  const autofill = applicant.autofillProfile;

  return {
    ...seed,
    personal: {
      ...seed.personal,
      fullName,
      email: applicant.email,
      phone: parsePhoneNumber(applicant.phone),
      location: applicant.location ?? seed.personal.location,
      linkedin: applicant.linkedinUrl ?? seed.personal.linkedin,
      website: applicant.websiteUrl ?? seed.personal.website
    },
    professionalSummary: applicant.profileContext?.summary ?? seed.professionalSummary,
    applicantContext: applicant.profileContext?.reusableContext ?? seed.applicantContext,
    autofill: {
      ...seed.autofill,
      workAuthorization: autofill?.workAuthorization || seed.autofill.workAuthorization,
      authorizedCountries: autofill
        ? parseWorkAuthorizationCountriesCsv(autofill.workAuthorizationCountriesCsv)
        : seed.autofill.authorizedCountries,
      requiresVisaSponsorship: autofill
        ? mapRequiresVisaSponsorship(autofill.requiresSponsorship)
        : seed.autofill.requiresVisaSponsorship,
      securityClearance: autofill
        ? mapSecurityClearance(autofill.clearanceStatus)
        : seed.autofill.securityClearance,
      willingToRelocate: autofill
        ? mapWillingToRelocate(autofill.relocation)
        : seed.autofill.willingToRelocate,
      workPreference: autofill?.workPreference || seed.autofill.workPreference,
      earliestStartDate: autofill?.startDate || seed.autofill.earliestStartDate
    }
  };
}

export async function runGreenhouseApply(input: {
  page: Page;
  sourceUrl: string;
  applicant: GreenhouseApplicant;
  helpers: GreenhouseApplyHelpers;
  cdpUrl?: string;
}): Promise<GreenhouseApplyResult> {
  /** Hosted boards with many custom questions: label resolution does many round-trips; avoid default 30s timeouts. */
  input.page.setDefaultTimeout(120_000);

  if (!input.page.url() || input.page.url() !== input.sourceUrl) {
    await input.page.goto(input.sourceUrl, {
      waitUntil: 'domcontentloaded'
    });
  }

  await ensureHostedInlineApplicationForm(input.page);

  await input.helpers.captureScreenshot?.({
    step: 'form_revealed',
    message: 'Revealed hosted Greenhouse application form.',
    details: {
      pageMode: 'hosted-inline'
    }
  });

  await fillFieldIfVisible({
    page: input.page,
    helpers: input.helpers,
    name: 'first_name',
    selectors: greenhouseSelectors.firstName,
    value: input.applicant.firstName
  });
  await fillFieldIfVisible({
    page: input.page,
    helpers: input.helpers,
    name: 'last_name',
    selectors: greenhouseSelectors.lastName,
    value: input.applicant.lastName
  });
  await fillFieldIfVisible({
    page: input.page,
    helpers: input.helpers,
    name: 'preferred_first_name',
    selectors: greenhouseSelectors.preferredFirstName,
    value: input.applicant.preferredFirstName ?? input.applicant.firstName
  });
  await fillFieldIfVisible({
    page: input.page,
    helpers: input.helpers,
    name: 'email',
    selectors: greenhouseSelectors.email,
    value: input.applicant.email
  });
  await selectCountryIfVisible({
    page: input.page,
    helpers: input.helpers,
    country: input.applicant.country
  });
  await fillFieldIfVisible({
    page: input.page,
    helpers: input.helpers,
    name: 'phone',
    selectors: greenhouseSelectors.phone,
    value: input.applicant.phone
  });
  await fillFieldIfVisible({
    page: input.page,
    helpers: input.helpers,
    name: 'location',
    selectors: greenhouseSelectors.location,
    value: input.applicant.location
  });
  await fillFieldIfVisible({
    page: input.page,
    helpers: input.helpers,
    name: 'linkedin_profile',
    labels: coreFieldLabels.linkedin,
    value: input.applicant.linkedinUrl
  });
  await fillFieldIfVisible({
    page: input.page,
    helpers: input.helpers,
    name: 'website',
    labels: coreFieldLabels.website,
    value: input.applicant.websiteUrl
  });

  await input.helpers.captureScreenshot?.({
    step: 'core_fields_filled',
    message: 'Filled Greenhouse core applicant fields.',
    details: {
      pageMode: 'hosted-inline'
    }
  });

  await uploadFileIfVisible({
    page: input.page,
    helpers: input.helpers,
    name: 'resume',
    selectors: greenhouseSelectors.resume,
    filePath: input.applicant.resumePath
  });
  await uploadFileIfVisible({
    page: input.page,
    helpers: input.helpers,
    name: 'cover_letter',
    selectors: greenhouseSelectors.coverLetter,
    filePath: input.applicant.coverLetterPath ?? null
  });

  await input.helpers.captureScreenshot?.({
    step: 'documents_uploaded',
    message: 'Uploaded Greenhouse application documents.',
    details: {
      pageMode: 'hosted-inline'
    }
  });

  await runDeterministicAutofillPass({
    page: input.page,
    helpers: input.helpers,
    applicant: input.applicant
  });

  const requiredFields = await collectFormFields(input.page, { requiredOnly: true });
  const evaluations = requiredFields.map((field) => ({
    field,
    classification: classifyRequiredField(field, input.applicant)
  }));

  await Promise.all(
    evaluations.map(({ field, classification }) =>
      input.helpers.logRequiredField?.({
        ...field,
        classification
      }) ?? Promise.resolve()
    )
  );

  const remainingRequiredFields: Array<{
    label: string;
    selector: string | null;
    controlType: string;
    classification: GreenhouseRequiredFieldClassification;
  }> = [];

  for (const { field, classification } of evaluations) {
    if (classification !== 'filled') {
      remainingRequiredFields.push({
        label: field.label,
        selector: field.selector,
        controlType: field.controlType,
        classification
      });
    }
  }

  const unresolvedFieldsForStagehand = (await collectFormFields(input.page, { requiredOnly: false }))
    .filter((field) => !field.filled)
    .filter((field) => field.controlType.toLowerCase() !== 'file');

  let stagehandAutomationResult: StagehandFieldHandlerResult | undefined;

  if (unresolvedFieldsForStagehand.length > 0) {
    const stagehandProfile = buildStagehandProfile(input.applicant);
    if (stagehandProfile) {
      const targetFields: StagehandTargetField[] = unresolvedFieldsForStagehand.map((field) => ({
        label: field.label,
        selector: field.selector,
        controlType: field.controlType
      }));

      stagehandAutomationResult = await runStagehandFieldHandler({
        page: input.page,
        targetFields,
        profile: stagehandProfile,
        jobContext: {
          country: input.applicant.country ?? 'Unknown',
          description: input.applicant.jobDescription ?? ''
        },
        ...(input.cdpUrl ? { cdpUrl: input.cdpUrl } : {})
      });

      await input.helpers.logStagehandAutomation?.({ result: stagehandAutomationResult });

      const succeededLabels = new Set(
        stagehandAutomationResult.results
          .filter((r) => r.success)
          .map((r) => r.fieldLabel)
      );

      for (let i = remainingRequiredFields.length - 1; i >= 0; i--) {
        const remainingField = remainingRequiredFields[i];
        if (remainingField && succeededLabels.has(remainingField.label)) {
          remainingRequiredFields.splice(i, 1);
        }
      }
    }
  }

  const submitButton = await findSubmitButton(input.page);
  if (!submitButton) {
    throw new Error('Greenhouse hosted application form did not expose a visible submit button.');
  }

  if (remainingRequiredFields.length > 0) {
    await input.helpers.stopBeforeSubmit({
      name: 'manual_review_required_questions',
      kind: 'stop',
      selector: submitButton.selector,
      details: {
        pageMode: 'hosted-inline',
        blockedRequiredFields: remainingRequiredFields,
        stagehandAutomation: stagehandAutomationResult
          ? {
              attempted: stagehandAutomationResult.attempted,
              succeeded: stagehandAutomationResult.succeeded,
              failed: stagehandAutomationResult.failed
            }
          : undefined,
        reviewUrlSessionNote:
          'Stored URL is the public job posting. Greenhouse keeps answers in the automation browser tab until submit; opening the link in your default browser starts a new empty form.'
      }
    });

    return {
      sourceUrl: input.sourceUrl,
      applicationUrl: input.page.url(),
      finalReviewUrl: input.page.url(),
      pageMode: 'hosted-inline',
      stoppedBeforeSubmit: true,
      submitted: false,
      ...(stagehandAutomationResult
        ? {
            stagehandAutomation: {
              attempted: stagehandAutomationResult.attempted,
              succeeded: stagehandAutomationResult.succeeded,
              failed: stagehandAutomationResult.failed
            }
          }
        : {})
    };
  }

  const preSubmitUrl = input.page.url();
  await submitButton.locator.click();

  await Promise.race([
    input.page.waitForURL((url) => url.toString() !== preSubmitUrl, {
      timeout: 7000
    }),
    input.page.waitForLoadState('networkidle', {
      timeout: 7000
    })
  ]).catch(() => undefined);

  await input.helpers.captureScreenshot?.({
    step: 'submitted',
    message: 'Submitted hosted Greenhouse application form.',
    details: {
      pageMode: 'hosted-inline'
    }
  });

  return {
    sourceUrl: input.sourceUrl,
    applicationUrl: input.page.url(),
    finalReviewUrl: input.page.url(),
    pageMode: 'hosted-inline',
    stoppedBeforeSubmit: false,
    submitted: true,
    ...(stagehandAutomationResult
      ? {
          stagehandAutomation: {
            attempted: stagehandAutomationResult.attempted,
            succeeded: stagehandAutomationResult.succeeded,
            failed: stagehandAutomationResult.failed
          }
        }
      : {})
  };
}

function resolveApplicantCountry(context: {
  applicantProfilePreferredCountries?: string[];
  fieldLocation?: string | null;
}): string | null {
  const displayNames = new Intl.DisplayNames(['en'], { type: 'region' });

  const preferredCountryCode = context.applicantProfilePreferredCountries?.[0];
  if (preferredCountryCode) {
    return displayNames.of(preferredCountryCode) ?? preferredCountryCode;
  }

  const trailingLocationSegment = context.fieldLocation
    ?.split(',')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .at(-1);

  if (!trailingLocationSegment) {
    return null;
  }

  if (trailingLocationSegment.length === 2) {
    return displayNames.of(trailingLocationSegment.toUpperCase()) ?? trailingLocationSegment;
  }

  return trailingLocationSegment;
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

    await context.logStep('open_source_posting', 'Opened Greenhouse source posting.', {
      pageMode: 'hosted-inline'
    });

    const applyResult = await runGreenhouseApply({
      page: context.session.page,
      sourceUrl: context.job.sourceUrl,
      ...(context.session.cdpUrl ? { cdpUrl: context.session.cdpUrl } : {}),
      applicant: {
        firstName: context.fieldMapping.firstName ?? '',
        lastName: context.fieldMapping.lastName ?? '',
        preferredFirstName: context.fieldMapping.firstName ?? '',
        email: context.fieldMapping.email ?? '',
        phone: context.fieldMapping.phone ?? '',
        location: context.fieldMapping.location ?? '',
        linkedinUrl: context.fieldMapping.linkedinUrl ?? '',
        websiteUrl: context.fieldMapping.websiteUrl ?? '',
        country: resolveApplicantCountry({
          applicantProfilePreferredCountries: context.applicantProfile?.preferredCountries ?? [],
          fieldLocation: context.fieldMapping.location ?? null
        }),
        resumePath: resume.storagePath,
        coverLetterPath: context.artifacts.coverLetter?.storagePath ?? null,
        autofillProfile: context.applicantProfile?.autofillProfile ?? null,
        extendedProfile: context.applicantProfile?.extendedProfile ?? null,
        ...(context.applicantProfile
          ? {
              profileContext: {
                summary: context.applicantProfile.summary,
                reusableContext: context.applicantProfile.reusableContext
              }
            }
          : {}),
        ...(context.job.descriptionText
          ? {
              jobDescription: context.job.descriptionText
            }
          : {})
      },
      helpers: {
        mapField: async (step) => {
          await context.logStep(step.name, `Filled ${step.name.replace(/_/g, ' ')}.`, {
            selector: step.selector,
            pageMode: 'hosted-inline'
          });
          await context.session.page.locator(step.selector).first().fill(step.value);
        },
        uploadFile: async (step) => {
          const artifact = step.name === 'cover_letter' ? context.artifacts.coverLetter : resume;
          await context.logStep(step.name, `Uploaded ${step.name.replace(/_/g, ' ')} artifact.`, {
            selector: step.selector,
            artifactId: artifact?.id ?? null,
            pageMode: 'hosted-inline'
          });
          await uploadArtifactFile({
            artifact,
            page: context.session.page,
            selector: step.selector,
            required: step.name === 'resume'
          });
        },
        captureScreenshot: context.captureScreenshot,
        logRequiredField: async (field) => {
          await context.logStep('required_field_evaluation', requiredFieldMessage(field.classification, field.label), {
            selector: field.selector,
            questionLabel: field.label,
            controlType: field.controlType,
            required: field.required,
            filled: field.filled,
            classification: field.classification,
            pageMode: 'hosted-inline'
          });
        },
        stopBeforeSubmit: async (step) => {
          await context.logStep(
            step.name,
            'Reached hosted Greenhouse manual review pause with unresolved required fields.',
            {
              selector: step.selector,
              pageMode: 'hosted-inline',
              ...(step.details ?? {})
            }
          );
          pausedRun = await context.stopBeforeSubmit({
            step: step.name,
            reviewUrl: context.session.page.url(),
            details: {
              pageMode: 'hosted-inline',
              ...(step.details ?? {})
            }
          });
        }
      }
    });

    if (applyResult.submitted) {
      await context.logStep('submitted', 'Submitted hosted Greenhouse application form.', {
        pageMode: 'hosted-inline',
        ...(applyResult.stagehandAutomation
          ? {
              stagehandAutomation: applyResult.stagehandAutomation
            }
          : {})
      });

      return context.completeAfterSubmit({
        step: 'submitted',
        reviewUrl: applyResult.finalReviewUrl,
        details: {
          pageMode: 'hosted-inline',
          ...(applyResult.stagehandAutomation
            ? {
                stagehandAutomation: applyResult.stagehandAutomation
              }
            : {})
        }
      });
    }

    if (!pausedRun) {
      throw new Error('Greenhouse apply flow did not reach the shared stop-before-submit guard.');
    }

    return pausedRun;
  }
};
