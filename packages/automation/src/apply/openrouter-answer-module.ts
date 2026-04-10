import {
  parseWorkAuthorizationCountriesCsv,
  type ApplicantProfile,
  type JobRecord
} from '@jobautomation/core';
import {
  createOpenRouterProvider,
  type GenerateStructuredObjectInput,
  type GenerateStructuredObjectResult,
  type OpenRouterConfig
} from '@jobautomation/llm';
import { z } from 'zod';

import type {
  ScrapedApplicationField,
  ScrapedApplicationFieldOption,
  ScrapedApplicationFieldType
} from './form-scraper';

const STAGE_4_LOG_PREFIX = '[Stage 4][openrouter-answer-module]';
const STAGE_4_PROMPT_VERSION = 'stage4-fill-plan-v1';
const MAX_SUMMARY_CHARS = 2_000;
const MAX_CONTEXT_CHARS = 4_000;

const applicationFillPlanActionSchema = z.enum(['fill', 'select', 'check', 'click', 'skip']);

const applicationFillPlanEntrySchema = z.object({
  fieldId: z.string().trim().min(1),
  action: applicationFillPlanActionSchema,
  value: z.union([z.string(), z.boolean(), z.array(z.string()), z.null()]).default(null),
  confidence: z.number().min(0).max(1),
  skipReason: z.string().trim().max(400).default('')
});

const applicationFillPlanResponseSchema = z.object({
  items: z.array(applicationFillPlanEntrySchema).default([])
});

const applicationFillPlanJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['fieldId', 'action', 'value', 'confidence', 'skipReason'],
        properties: {
          fieldId: {
            type: 'string',
            minLength: 1
          },
          action: {
            type: 'string',
            enum: ['fill', 'select', 'check', 'click', 'skip']
          },
          value: {
            anyOf: [
              { type: 'string' },
              { type: 'boolean' },
              {
                type: 'array',
                items: { type: 'string' }
              },
              { type: 'null' }
            ]
          },
          confidence: {
            type: 'number',
            minimum: 0,
            maximum: 1
          },
          skipReason: {
            type: 'string',
            maxLength: 400
          }
        }
      }
    }
  }
} as const;

export type ApplicationFillPlanAction = z.infer<typeof applicationFillPlanActionSchema>;

export type ApplicationFillPlanEntry = z.infer<typeof applicationFillPlanEntrySchema>;

export type ApplicationAnswerProvider = {
  generateStructuredObject: (input: GenerateStructuredObjectInput) => Promise<unknown>;
  generateStructuredObjectWithMetadata?: (
    input: GenerateStructuredObjectInput
  ) => Promise<GenerateStructuredObjectResult>;
};

export type GenerateApplicationFillPlanInput = {
  applicantProfile: ApplicantProfile | null;
  job: Pick<JobRecord, 'title' | 'companyName' | 'location' | 'sourceUrl'>;
  fields: ScrapedApplicationField[];
  openRouter?: OpenRouterConfig | null;
  provider?: ApplicationAnswerProvider;
};

export type GenerateApplicationFillPlanResult = {
  promptVersion: string;
  rawResponseLength: number;
  serializedProfileShape: Record<string, unknown>;
  promptPayload: ApplicationFillPlanPromptPayload;
  responseJson: z.infer<typeof applicationFillPlanResponseSchema>;
  fieldDiagnostics: ApplicationFillPlanFieldDiagnostic[];
  fillPlan: ApplicationFillPlanEntry[];
};

export class ApplicationAnswerGenerationError extends Error {
  constructor(
    readonly code: 'not_configured' | 'invalid_output' | 'provider_error',
    message: string
  ) {
    super(message);
    this.name = 'ApplicationAnswerGenerationError';
  }
}

type SerializedApplicantProfile = {
  available: boolean;
  identity: {
    fullName: string;
    email: string;
    phone: string;
    location: string;
    linkedinUrl: string;
    websiteUrl: string;
  };
  summary: string;
  reusableContext: string;
  preferredCountries: string[];
  workAuthorization: {
    authorizedWithoutSponsorshipCountryCodes: string[];
    requiresSponsorship: boolean | null;
    requiresSponsorshipCountryCodes: string[];
    noticePeriod: string | null;
    startDate: string | null;
  };
  preferences: {
    relocation: string | null;
    workPreference: string | null;
    willingToTravel: string | null;
    willingToWorkNightsWeekends: string | null;
    salaryExpectations: string | null;
  };
  qualifications: {
    yearsOfExperience: string | null;
    highestEducation: string | null;
    highestEducationSchool: string | null;
    highestEducationProgram: string | null;
    highestEducationDiscipline: string | null;
    certificationsLicenses: string | null;
    languagesSpoken: string | null;
    driversLicense: string | null;
    currentlyEmployed: string | null;
  };
  equalEmployment: {
    genderPronouns: string | null;
    genderPronounsCustom: string | null;
    raceEthnicity: string | null;
    veteranStatus: string | null;
    disabilityStatus: string | null;
    criminalBackground: string | null;
  };
};

type PromptField = {
  id: string;
  label: string;
  type: ScrapedApplicationFieldType;
  required: boolean;
  enabled: boolean;
  options: ScrapedApplicationFieldOption[];
  answerability: PromptFieldAnswerability;
  guidance: string;
  specialHandling?: string;
};

export type PromptFieldAnswerability =
  | 'direct_profile'
  | 'structured_profile'
  | 'conditional_follow_up'
  | 'company_specific_or_unsupported';

export type ApplicationFillPlanDiagnosticCategory =
  | 'accepted'
  | 'schema_mismatch'
  | 'unsupported_field_type'
  | 'missing_profile_fact'
  | 'model_uncertainty'
  | 'normalization_rejection';

export type ApplicationFillPlanFieldDiagnostic = {
  fieldId: string;
  label: string;
  type: ScrapedApplicationFieldType;
  required: boolean;
  answerability: PromptFieldAnswerability;
  category: ApplicationFillPlanDiagnosticCategory;
  rawAction: ApplicationFillPlanAction | null;
  normalizedAction: ApplicationFillPlanAction;
  expectedActions: ApplicationFillPlanAction[];
  reason: string;
  recovered: boolean;
};

export type ApplicationFillPlanPromptPayload = {
  job: GenerateApplicationFillPlanInput['job'];
  applicantProfile: SerializedApplicantProfile;
  fields: PromptField[];
};

function logStage4(action: string, details: Record<string, unknown>): void {
  // DEBUG: remove after Stage 4
  console.log(`${STAGE_4_LOG_PREFIX} ${action} ${JSON.stringify(details)}`);
}

function truncate(value: string, maxChars: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= maxChars) {
    return trimmed;
  }

  return `${trimmed.slice(0, maxChars)}\n[truncated]`;
}

function serializeApplicantProfile(
  applicantProfile: ApplicantProfile | null
): SerializedApplicantProfile {
  if (!applicantProfile) {
    return {
      available: false,
      identity: {
        fullName: '',
        email: '',
        phone: '',
        location: '',
        linkedinUrl: '',
        websiteUrl: ''
      },
      summary: '',
      reusableContext: '',
      preferredCountries: [],
      workAuthorization: {
        authorizedWithoutSponsorshipCountryCodes: [],
        requiresSponsorship: null,
        requiresSponsorshipCountryCodes: [],
        noticePeriod: null,
        startDate: null
      },
      preferences: {
        relocation: null,
        workPreference: null,
        willingToTravel: null,
        willingToWorkNightsWeekends: null,
        salaryExpectations: null
      },
      qualifications: {
        yearsOfExperience: null,
        highestEducation: null,
        highestEducationSchool: null,
        highestEducationProgram: null,
        highestEducationDiscipline: null,
        certificationsLicenses: null,
        languagesSpoken: null,
        driversLicense: null,
        currentlyEmployed: null
      },
      equalEmployment: {
        genderPronouns: null,
        genderPronounsCustom: null,
        raceEthnicity: null,
        veteranStatus: null,
        disabilityStatus: null,
        criminalBackground: null
      }
    };
  }

  const autofillProfile = applicantProfile.autofillProfile;
  const requiresSponsorship =
    autofillProfile.requiresSponsorship === 'yes'
      ? true
      : autofillProfile.requiresSponsorship === 'no'
        ? false
        : null;

  return {
    available: true,
    identity: {
      fullName: applicantProfile.fullName.trim(),
      email: applicantProfile.email.trim(),
      phone: applicantProfile.phone.trim(),
      location: applicantProfile.location.trim(),
      linkedinUrl: applicantProfile.linkedinUrl.trim(),
      websiteUrl: applicantProfile.websiteUrl.trim()
    },
    summary: truncate(applicantProfile.summary, MAX_SUMMARY_CHARS),
    reusableContext: truncate(applicantProfile.reusableContext, MAX_CONTEXT_CHARS),
    preferredCountries: applicantProfile.preferredCountries,
    workAuthorization: {
      authorizedWithoutSponsorshipCountryCodes: parseWorkAuthorizationCountriesCsv(
        autofillProfile.workAuthorizationCountriesCsv
      ),
      requiresSponsorship,
      requiresSponsorshipCountryCodes: parseWorkAuthorizationCountriesCsv(
        autofillProfile.requiresSponsorshipCountriesCsv
      ),
      noticePeriod: autofillProfile.noticePeriod || null,
      startDate: autofillProfile.startDate.trim() || null
    },
    preferences: {
      relocation: autofillProfile.relocation || null,
      workPreference: autofillProfile.workPreference || null,
      willingToTravel: autofillProfile.willingToTravel || null,
      willingToWorkNightsWeekends: autofillProfile.willingToWorkNightsWeekends || null,
      salaryExpectations: autofillProfile.salaryExpectations.trim() || null
    },
    qualifications: {
      yearsOfExperience: autofillProfile.yearsOfExperience || null,
      highestEducation: autofillProfile.highestEducation || null,
      highestEducationSchool: autofillProfile.highestEducationSchool.trim() || null,
      highestEducationProgram: autofillProfile.highestEducationProgram.trim() || null,
      highestEducationDiscipline: autofillProfile.highestEducationDiscipline.trim() || null,
      certificationsLicenses: autofillProfile.certificationsLicenses.trim() || null,
      languagesSpoken: autofillProfile.languagesSpoken.trim() || null,
      driversLicense: autofillProfile.driversLicense || null,
      currentlyEmployed: autofillProfile.currentlyEmployed || null
    },
    equalEmployment: {
      genderPronouns: autofillProfile.genderPronouns || null,
      genderPronounsCustom: autofillProfile.genderPronounsCustom.trim() || null,
      raceEthnicity: autofillProfile.raceEthnicity || null,
      veteranStatus: autofillProfile.veteranStatus || null,
      disabilityStatus: autofillProfile.disabilityStatus || null,
      criminalBackground: autofillProfile.criminalBackground || null
    }
  };
}

function describeSerializedProfileShape(
  serializedProfile: SerializedApplicantProfile
): Record<string, unknown> {
  return {
    available: serializedProfile.available,
    identityKeys: Object.entries(serializedProfile.identity)
      .filter(([, value]) => value.length > 0)
      .map(([key]) => key),
    hasSummary: serializedProfile.summary.length > 0,
    hasReusableContext: serializedProfile.reusableContext.length > 0,
    preferredCountryCount: serializedProfile.preferredCountries.length,
    workAuthorization: {
      authorizedCountryCount:
        serializedProfile.workAuthorization.authorizedWithoutSponsorshipCountryCodes.length,
      requiresSponsorship: serializedProfile.workAuthorization.requiresSponsorship,
      sponsorshipCountryCount:
        serializedProfile.workAuthorization.requiresSponsorshipCountryCodes.length
    }
  };
}

function normalizeTextForMatching(value: string): string {
  return value.trim().toLowerCase();
}

function includesAny(value: string, candidates: string[]): boolean {
  const normalizedValue = normalizeTextForMatching(value);
  return candidates.some((candidate) => normalizedValue.includes(candidate));
}

function classifyFieldAnswerability(field: ScrapedApplicationField): PromptFieldAnswerability {
  const fingerprint = `${field.id} ${field.label}`;

  if (
    includesAny(fingerprint, ['if other', 'please specify', 'if you have held']) ||
    normalizeTextForMatching(field.label).startsWith('if ')
  ) {
    return 'conditional_follow_up';
  }

  if (
    includesAny(fingerprint, [
      'first name',
      'last name',
      'full name',
      ' email',
      'phone',
      'location',
      'country',
      'linkedin',
      'website',
      'portfolio'
    ])
  ) {
    return 'direct_profile';
  }

  if (
    includesAny(fingerprint, [
      'work authorization',
      'authorized to work',
      'legally authorized',
      'sponsorship',
      'citizen',
      'citizenship',
      'pronouns',
      'gender',
      'race',
      'ethnicity',
      'hispanic',
      'veteran',
      'disability'
    ])
  ) {
    return 'structured_profile';
  }

  return 'company_specific_or_unsupported';
}

function guidanceForAnswerability(answerability: PromptFieldAnswerability): string {
  switch (answerability) {
    case 'direct_profile':
      return 'Answer directly from the applicant identity/profile facts when available.';
    case 'structured_profile':
      return 'Answer only from structured applicant facts. If the exact fact is not present, skip.';
    case 'conditional_follow_up':
      return 'Answer only when a prerequisite answer is explicitly grounded. Otherwise skip.';
    case 'company_specific_or_unsupported':
      return 'Skip unless the applicant profile explicitly contains the exact company-specific fact.';
  }
}

function toPromptField(field: ScrapedApplicationField): PromptField {
  const answerability = classifyFieldAnswerability(field);
  return {
    id: field.id,
    label: field.label,
    type: field.type,
    required: field.required,
    enabled: field.enabled,
    options: field.options,
    answerability,
    guidance: guidanceForAnswerability(answerability),
    ...(field.specialHandling ? { specialHandling: field.specialHandling } : {})
  };
}

function buildSystemPrompt(): string {
  return [
    'You create a structured application fill plan for a single job-board page state.',
    `Prompt version: ${STAGE_4_PROMPT_VERSION}.`,
    'Use only the applicant profile facts and the scraped field definitions provided by the user.',
    'Never invent qualifications, work authorization, company-specific motivation, compensation, or demographic data.',
    'If a field is uncertain, ambiguous, company-specific, or unsupported, return action "skip" with a short skipReason.',
    'Action rules:',
    '- text, email, tel, textarea, rich_text, combobox => action "fill" with a string value.',
    '- combobox is a typed searchable widget. Do not return action "select" for combobox.',
    '- select => action "select" with an exact option value when possible.',
    '- checkbox => action "check" with a boolean value.',
    '- checkbox_group => action "check" with an array of exact option values.',
    '- radio_group => action "click" with an exact option value.',
    '- file uploads are handled later, so use action "skip".',
    'Work authorization rules:',
    '- authorizedWithoutSponsorshipCountryCodes lists countries where the candidate can work without sponsorship.',
    '- requiresSponsorship tells you whether the candidate needs sponsorship now or later when asked generally.',
    '- if the field asks about a country not covered by the profile facts, skip instead of guessing.',
    'Return JSON only with shape { "items": [...] }.',
    'Every item must include fieldId, action, value, confidence, and skipReason.',
    'When action is not "skip", keep skipReason as an empty string.',
    'Confidence must be between 0 and 1.'
  ].join('\n');
}

function createPromptPayload(input: {
  job: GenerateApplicationFillPlanInput['job'];
  serializedProfile: SerializedApplicantProfile;
  fields: ScrapedApplicationField[];
}): ApplicationFillPlanPromptPayload {
  return {
    job: {
      title: input.job.title,
      companyName: input.job.companyName,
      location: input.job.location,
      sourceUrl: input.job.sourceUrl
    },
    applicantProfile: input.serializedProfile,
    fields: input.fields.map(toPromptField)
  };
}

function buildPrompt(promptPayload: ApplicationFillPlanPromptPayload): string {
  return JSON.stringify(promptPayload, null, 2);
}

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(1, value));
}

function normalizeForComparison(value: string): string {
  return value.trim().toLowerCase();
}

function resolveOptionValue(
  options: ScrapedApplicationFieldOption[],
  candidate: string
): string | null {
  const normalizedCandidate = normalizeForComparison(candidate);
  if (!normalizedCandidate) {
    return null;
  }

  for (const option of options) {
    if (normalizeForComparison(option.value) === normalizedCandidate) {
      return option.value;
    }

    if (normalizeForComparison(option.label) === normalizedCandidate) {
      return option.value;
    }
  }

  return null;
}

function coerceCheckboxValue(value: ApplicationFillPlanEntry['value']): boolean | null {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const normalized = normalizeForComparison(value);
  if (['true', 'yes', 'y', '1', 'checked'].includes(normalized)) {
    return true;
  }

  if (['false', 'no', 'n', '0', 'unchecked'].includes(normalized)) {
    return false;
  }

  return null;
}

function expectedActionsForField(field: ScrapedApplicationField): ApplicationFillPlanAction[] {
  switch (field.type) {
    case 'select':
      return ['select'];
    case 'radio_group':
      return ['click'];
    case 'checkbox':
    case 'checkbox_group':
      return ['check'];
    case 'file':
      return ['skip'];
    default:
      return ['fill'];
  }
}

function defaultSkipReasonForAnswerability(answerability: PromptFieldAnswerability): string {
  switch (answerability) {
    case 'company_specific_or_unsupported':
    case 'conditional_follow_up':
      return 'missing_profile_fact: no grounded applicant profile fact is available for this field';
    case 'direct_profile':
    case 'structured_profile':
      return 'model_uncertainty: the model did not return a grounded answer for this field';
  }
}

function createDiagnostic(input: {
  field: ScrapedApplicationField;
  answerability: PromptFieldAnswerability;
  category: ApplicationFillPlanDiagnosticCategory;
  rawAction: ApplicationFillPlanAction | null;
  normalizedAction: ApplicationFillPlanAction;
  reason: string;
  recovered: boolean;
}): ApplicationFillPlanFieldDiagnostic {
  return {
    fieldId: input.field.id,
    label: input.field.label,
    type: input.field.type,
    required: input.field.required,
    answerability: input.answerability,
    category: input.category,
    rawAction: input.rawAction,
    normalizedAction: input.normalizedAction,
    expectedActions: expectedActionsForField(input.field),
    reason: input.reason,
    recovered: input.recovered
  };
}

function createSkipResult(input: {
  field: ScrapedApplicationField;
  answerability: PromptFieldAnswerability;
  rawEntry?: ApplicationFillPlanEntry;
  skipReason: string;
  category: ApplicationFillPlanDiagnosticCategory;
}): { entry: ApplicationFillPlanEntry; diagnostic: ApplicationFillPlanFieldDiagnostic } {
  return {
    entry: {
      fieldId: input.field.id,
      action: 'skip',
      value: null,
      confidence: input.rawEntry ? clampConfidence(input.rawEntry.confidence) : 0,
      skipReason: input.skipReason
    },
    diagnostic: createDiagnostic({
      field: input.field,
      answerability: input.answerability,
      category: input.category,
      rawAction: input.rawEntry?.action ?? null,
      normalizedAction: 'skip',
      reason: input.skipReason,
      recovered: false
    })
  };
}

function createAcceptedResult(input: {
  field: ScrapedApplicationField;
  answerability: PromptFieldAnswerability;
  rawEntry?: ApplicationFillPlanEntry;
  normalizedAction: ApplicationFillPlanAction;
  value: ApplicationFillPlanEntry['value'];
  confidence: number;
  category?: ApplicationFillPlanDiagnosticCategory;
  reason?: string;
  recovered?: boolean;
}): { entry: ApplicationFillPlanEntry; diagnostic: ApplicationFillPlanFieldDiagnostic } {
  const category = input.category ?? 'accepted';
  const reason = input.reason ?? 'accepted';
  const recovered = input.recovered ?? false;

  return {
    entry: {
      fieldId: input.field.id,
      action: input.normalizedAction,
      value: input.value,
      confidence: clampConfidence(input.confidence),
      skipReason: ''
    },
    diagnostic: createDiagnostic({
      field: input.field,
      answerability: input.answerability,
      category,
      rawAction: input.rawEntry?.action ?? null,
      normalizedAction: input.normalizedAction,
      reason,
      recovered
    })
  };
}

function normalizeEntryForField(
  field: ScrapedApplicationField,
  answerability: PromptFieldAnswerability,
  entry: ApplicationFillPlanEntry | undefined
): { entry: ApplicationFillPlanEntry; diagnostic: ApplicationFillPlanFieldDiagnostic } {
  if (!entry) {
    return createSkipResult({
      field,
      answerability,
      skipReason: defaultSkipReasonForAnswerability(answerability),
      category:
        answerability === 'company_specific_or_unsupported' ||
        answerability === 'conditional_follow_up'
          ? 'missing_profile_fact'
          : 'model_uncertainty'
    });
  }

  if (field.type === 'file') {
    return {
      entry: {
        fieldId: field.id,
        action: 'skip',
        value: null,
        confidence: clampConfidence(entry.confidence),
        skipReason: entry.skipReason || 'file_upload_handled_later'
      },
      diagnostic: createDiagnostic({
        field,
        answerability,
        category: 'unsupported_field_type',
        rawAction: entry.action,
        normalizedAction: 'skip',
        reason: entry.skipReason || 'file_upload_handled_later',
        recovered: false
      })
    };
  }

  if (entry.action === 'skip') {
    return createSkipResult({
      field,
      answerability,
      rawEntry: entry,
      skipReason:
        answerability === 'company_specific_or_unsupported' ||
        answerability === 'conditional_follow_up'
          ? 'missing_profile_fact: no grounded applicant profile fact is available for this field'
          : entry.skipReason || defaultSkipReasonForAnswerability(answerability),
      category:
        answerability === 'company_specific_or_unsupported' ||
        answerability === 'conditional_follow_up'
          ? 'missing_profile_fact'
          : 'model_uncertainty'
    });
  }

  if (field.type === 'combobox') {
    if (entry.action === 'fill' && typeof entry.value === 'string') {
      const textValue = entry.value.trim();
      return textValue.length > 0
        ? createAcceptedResult({
            field,
            answerability,
            rawEntry: entry,
            normalizedAction: 'fill',
            value: textValue,
            confidence: entry.confidence
          })
        : createSkipResult({
            field,
            answerability,
            rawEntry: entry,
            skipReason: 'normalization_rejection: the model returned an empty fill value',
            category: 'normalization_rejection'
          });
    }

    if (entry.action === 'select' && typeof entry.value === 'string') {
      const textValue = entry.value.trim();
      return textValue.length > 0
        ? createAcceptedResult({
            field,
            answerability,
            rawEntry: entry,
            normalizedAction: 'fill',
            value: textValue,
            confidence: entry.confidence,
            category: 'schema_mismatch',
            reason: 'schema_mismatch: combobox fields require action "fill"; recovered from model action "select"',
            recovered: true
          })
        : createSkipResult({
            field,
            answerability,
            rawEntry: entry,
            skipReason: defaultSkipReasonForAnswerability(answerability),
            category:
              answerability === 'company_specific_or_unsupported' ||
              answerability === 'conditional_follow_up'
                ? 'missing_profile_fact'
                : 'model_uncertainty'
          });
    }

    return createSkipResult({
      field,
      answerability,
      rawEntry: entry,
      skipReason:
        entry.action === 'select'
          ? defaultSkipReasonForAnswerability(answerability)
          : `schema_mismatch: expected ${expectedActionsForField(field).join('/')} for ${field.type}, got ${entry.action}`,
      category:
        entry.action === 'select'
          ? answerability === 'company_specific_or_unsupported' ||
            answerability === 'conditional_follow_up'
            ? 'missing_profile_fact'
            : 'model_uncertainty'
          : 'schema_mismatch'
    });
  }

  if (field.type === 'select') {
    if (entry.action !== 'select' || typeof entry.value !== 'string') {
      return createSkipResult({
        field,
        answerability,
        rawEntry: entry,
        skipReason: `schema_mismatch: expected select for ${field.type}, got ${entry.action}`,
        category: 'schema_mismatch'
      });
    }

    const optionValue = resolveOptionValue(field.options, entry.value);
    return optionValue
      ? createAcceptedResult({
          field,
          answerability,
          rawEntry: entry,
          normalizedAction: 'select',
          value: optionValue,
          confidence: entry.confidence
        })
      : createSkipResult({
          field,
          answerability,
          rawEntry: entry,
          skipReason: 'normalization_rejection: the model selected an option that does not exist',
          category: 'normalization_rejection'
        });
  }

  if (field.type === 'radio_group') {
    if (entry.action !== 'click' || typeof entry.value !== 'string') {
      return createSkipResult({
        field,
        answerability,
        rawEntry: entry,
        skipReason: `schema_mismatch: expected click for ${field.type}, got ${entry.action}`,
        category: 'schema_mismatch'
      });
    }

    const optionValue = resolveOptionValue(field.options, entry.value);
    return optionValue
      ? createAcceptedResult({
          field,
          answerability,
          rawEntry: entry,
          normalizedAction: 'click',
          value: optionValue,
          confidence: entry.confidence
        })
      : createSkipResult({
          field,
          answerability,
          rawEntry: entry,
          skipReason: 'normalization_rejection: the model selected a radio option that does not exist',
          category: 'normalization_rejection'
        });
  }

  if (field.type === 'checkbox_group') {
    if (entry.action !== 'check') {
      return createSkipResult({
        field,
        answerability,
        rawEntry: entry,
        skipReason: `schema_mismatch: expected check for ${field.type}, got ${entry.action}`,
        category: 'schema_mismatch'
      });
    }

    const rawValues =
      typeof entry.value === 'string'
        ? [entry.value]
        : Array.isArray(entry.value)
          ? entry.value
          : [];
    const values = Array.from(
      new Set(
        rawValues
          .map((value) => resolveOptionValue(field.options, value))
          .filter((value): value is string => Boolean(value))
      )
    );

    return values.length > 0
      ? createAcceptedResult({
          field,
          answerability,
          rawEntry: entry,
          normalizedAction: 'check',
          value: values,
          confidence: entry.confidence
        })
      : createSkipResult({
          field,
          answerability,
          rawEntry: entry,
          skipReason: 'normalization_rejection: the model selected checkbox options that do not exist',
          category: 'normalization_rejection'
        });
  }

  if (field.type === 'checkbox') {
    if (entry.action !== 'check') {
      return createSkipResult({
        field,
        answerability,
        rawEntry: entry,
        skipReason: `schema_mismatch: expected check for ${field.type}, got ${entry.action}`,
        category: 'schema_mismatch'
      });
    }

    const booleanValue = coerceCheckboxValue(entry.value);
    return booleanValue === null
      ? createSkipResult({
          field,
          answerability,
          rawEntry: entry,
          skipReason: 'normalization_rejection: the model returned an invalid checkbox value',
          category: 'normalization_rejection'
        })
      : createAcceptedResult({
          field,
          answerability,
          rawEntry: entry,
          normalizedAction: 'check',
          value: booleanValue,
          confidence: entry.confidence
        });
  }

  if (entry.action !== 'fill' || typeof entry.value !== 'string') {
    return createSkipResult({
      field,
      answerability,
      rawEntry: entry,
      skipReason: `schema_mismatch: expected fill for ${field.type}, got ${entry.action}`,
      category: 'schema_mismatch'
    });
  }

  const textValue = entry.value.trim();
  return textValue.length > 0
    ? createAcceptedResult({
        field,
        answerability,
        rawEntry: entry,
        normalizedAction: 'fill',
        value: textValue,
        confidence: entry.confidence
      })
    : createSkipResult({
        field,
        answerability,
        rawEntry: entry,
        skipReason: 'normalization_rejection: the model returned an empty fill value',
        category: 'normalization_rejection'
      });
}

function normalizeFillPlan(
  fields: ScrapedApplicationField[],
  items: ApplicationFillPlanEntry[]
): {
  fillPlan: ApplicationFillPlanEntry[];
  fieldDiagnostics: ApplicationFillPlanFieldDiagnostic[];
} {
  const firstEntryByFieldId = new Map<string, ApplicationFillPlanEntry>();

  for (const item of items) {
    if (!firstEntryByFieldId.has(item.fieldId)) {
      firstEntryByFieldId.set(item.fieldId, item);
    }
  }

  const normalized = fields.map((field) =>
    normalizeEntryForField(
      field,
      classifyFieldAnswerability(field),
      firstEntryByFieldId.get(field.id)
    )
  );

  return {
    fillPlan: normalized.map((item) => item.entry),
    fieldDiagnostics: normalized.map((item) => item.diagnostic)
  };
}

export async function generateApplicationFillPlan(
  input: GenerateApplicationFillPlanInput
): Promise<GenerateApplicationFillPlanResult> {
  const provider =
    input.provider ??
    (input.openRouter?.apiKey?.trim() ? createOpenRouterProvider(input.openRouter) : null);

  if (!provider) {
    throw new ApplicationAnswerGenerationError(
      'not_configured',
      'OpenRouter is not configured, so stage-four fill-plan generation is unavailable.'
    );
  }

  const serializedProfile = serializeApplicantProfile(input.applicantProfile);
  const serializedProfileShape = describeSerializedProfileShape(serializedProfile);
  const promptPayload = createPromptPayload({
    job: input.job,
    serializedProfile,
    fields: input.fields
  });

  logStage4('request_prepared', {
    promptVersion: STAGE_4_PROMPT_VERSION,
    fieldCount: input.fields.length,
    serializedProfileShape,
    answerabilityCounts: promptPayload.fields.reduce<Record<string, number>>((counts, field) => {
      counts[field.answerability] = (counts[field.answerability] ?? 0) + 1;
      return counts;
    }, {})
  });

  const request = {
    schemaName: 'application_fill_plan',
    schema: applicationFillPlanJsonSchema as unknown as Record<string, unknown>,
    systemPrompt: buildSystemPrompt(),
    prompt: buildPrompt(promptPayload)
  } satisfies GenerateStructuredObjectInput;

  try {
    const response =
      provider.generateStructuredObjectWithMetadata !== undefined
        ? await provider.generateStructuredObjectWithMetadata(request)
        : {
            object: await provider.generateStructuredObject(request),
            rawText: ''
          };

    const parsed = applicationFillPlanResponseSchema.safeParse(response.object);
    if (!parsed.success) {
      logStage4('response_parsed', {
        promptVersion: STAGE_4_PROMPT_VERSION,
        rawResponseLength: response.rawText.length,
        parseStatus: 'invalid',
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message
        }))
      });

      throw new ApplicationAnswerGenerationError(
        'invalid_output',
        'OpenRouter returned invalid structured output for the application fill plan.'
      );
    }

    const { fillPlan, fieldDiagnostics } = normalizeFillPlan(input.fields, parsed.data.items);
    const skippedFieldIds = fillPlan
      .filter((entry) => entry.action === 'skip')
      .map((entry) => entry.fieldId);
    const uncertainFieldIds = fillPlan
      .filter((entry) => entry.action !== 'skip' && entry.confidence < 0.7)
      .map((entry) => entry.fieldId);
    const diagnosticCategoryCounts = fieldDiagnostics.reduce<Record<string, number>>(
      (counts, diagnostic) => {
        counts[diagnostic.category] = (counts[diagnostic.category] ?? 0) + 1;
        return counts;
      },
      {}
    );

    logStage4('response_parsed', {
      promptVersion: STAGE_4_PROMPT_VERSION,
      rawResponseLength: response.rawText.length,
      parseStatus: 'parsed',
      skippedFieldIds,
      uncertainFieldIds,
      diagnosticCategoryCounts
    });

    return {
      promptVersion: STAGE_4_PROMPT_VERSION,
      rawResponseLength: response.rawText.length,
      serializedProfileShape,
      promptPayload,
      responseJson: parsed.data,
      fieldDiagnostics,
      fillPlan
    };
  } catch (error) {
    if (error instanceof ApplicationAnswerGenerationError) {
      throw error;
    }

    throw new ApplicationAnswerGenerationError(
      'provider_error',
      error instanceof Error ? error.message : 'OpenRouter request failed.'
    );
  }
}
