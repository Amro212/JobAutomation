import {
  defaultMinimalAutofillProfile,
  FILTER_COUNTRIES,
  getCountrySearchTokens,
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
import type { ApplicationArtifacts } from './contracts';
import {
  isFieldRequired,
  type FieldOptionMode,
  type FieldRequiredSource
} from './field-contract';
import {
  validateRequiredFillPlan,
  type ApplicationFillPlanMissingRequiredField,
  type ApplicationFillPlanValidationResult
} from './fill-plan-validator';

const STAGE_4_LOG_PREFIX = '[Stage 4][openrouter-answer-module]';
const STAGE_4_PROMPT_VERSION = 'stage4-fill-plan-v1';
/** Deterministic merge passes after repairs when binary consent fields are missing or mis-shaped by the LLM. */
const MAX_SYNTHETIC_CHOICE_FALLBACK_PASSES = 0;
const MAX_STAGE4_REPAIR_ATTEMPTS = 3;
const MAX_STAGE4_INVALID_JSON_RETRIES = 2;
const MAX_SUMMARY_CHARS = 2_000;
const MAX_CONTEXT_CHARS = 4_000;
const MAX_RESUME_LATEX_CHARS = 20_000;
const MAX_RESUME_EXCERPT_CHARS = 2_500;
const MAX_RESUME_LINES = 12;

const RESUME_TECHNOLOGY_KEYWORDS = [
  'TypeScript',
  'JavaScript',
  'Python',
  'Node.js',
  'React',
  'Playwright',
  'Postgres',
  'PostgreSQL',
  'MySQL',
  'SQL',
  'Docker',
  'AWS',
  'REST API',
  'GraphQL',
  'CI/CD'
] as const;

const applicationFillPlanActionSchema = z.enum(['fill', 'select', 'check', 'click', 'skip']);

const applicationFillPlanEntrySchema = z.object({
  fieldId: z.string().trim().min(1),
  action: applicationFillPlanActionSchema,
  value: z.union([z.string(), z.boolean(), z.array(z.string()), z.null()]).default(null),
  selectedOptionValue: z.string().trim().nullable().optional(),
  selectedOptionLabel: z.string().trim().nullable().optional(),
  searchText: z.string().trim().nullable().optional(),
  evidenceMode: z
    .enum(['direct_profile', 'inferred_required', 'policy_default', 'unsupported_optional'])
    .optional(),
  evidenceRefs: z.array(z.string().trim()).optional(),
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
        required: [
          'fieldId',
          'action',
          'value',
          'selectedOptionValue',
          'selectedOptionLabel',
          'searchText',
          'evidenceMode',
          'evidenceRefs',
          'confidence',
          'skipReason'
        ],
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
          selectedOptionValue: {
            anyOf: [{ type: 'string' }, { type: 'null' }]
          },
          selectedOptionLabel: {
            anyOf: [{ type: 'string' }, { type: 'null' }]
          },
          searchText: {
            anyOf: [{ type: 'string' }, { type: 'null' }]
          },
          evidenceMode: {
            type: 'string',
            enum: ['direct_profile', 'inferred_required', 'policy_default', 'unsupported_optional']
          },
          evidenceRefs: {
            type: 'array',
            items: { type: 'string' }
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
  artifacts?: ApplicationArtifacts;
  openRouter?: OpenRouterConfig | null;
  provider?: ApplicationAnswerProvider;
};

export type GenerateApplicationFillPlanResult = {
  promptVersion: string;
  rawResponseLength: number;
  serializedProfileShape: Record<string, unknown>;
  promptPayload: ApplicationFillPlanPromptPayload;
  repairPromptPayload: ApplicationFillPlanRepairPromptPayload | null;
  responseJson: z.infer<typeof applicationFillPlanResponseSchema>;
  repairResponseJson: z.infer<typeof applicationFillPlanResponseSchema> | null;
  fieldDiagnostics: ApplicationFillPlanFieldDiagnostic[];
  fillPlanValidation: ApplicationFillPlanValidationResult;
  repairRawResponseLength: number;
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

type ResumeContext = {
  available: boolean;
  recentRoles: string[];
  technologies: string[];
  projectSignals: string[];
  achievementSignals: string[];
  stakeholderSignals: string[];
  excerpt: string;
  hasProfessionalRoleSignals: boolean;
};

type ResumeLatexContext = {
  available: boolean;
  fileName: string | null;
  tex: string;
};

type CompletionPolicyDefaults = {
  consentToInterviewRecording: 'yes' | 'no' | null;
  acceptApplicationPrivacyNotices: 'yes' | 'no' | null;
  consentToDemographicDataProcessing: 'yes' | 'no' | null;
  lgbtqiaCommunityIdentification: 'yes' | 'no' | 'prefer_not_to_say' | null;
};

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
  resumeLatex: ResumeLatexContext;
  resumeContext: ResumeContext;
  preferredCountries: string[];
  completionPolicyDefaults: CompletionPolicyDefaults;
  workAuthorization: {
    authorizedWithoutSponsorshipCountryCodes: string[];
    requiresSponsorship: boolean | null;
    requiresSponsorshipCountryCodes: string[];
    currentCountryCode: string | null;
    primaryCitizenshipCountryCode: string | null;
    currentCountryResidenceStatus: string | null;
    currentCountryResidenceStatusOther: string | null;
    legallyAuthorizedInCurrentCountry: string | null;
    needsSponsorshipInCurrentCountry: string | null;
    clearanceStatus: string | null;
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
    highestEducationStartYear: string | null;
    highestEducationEndYear: string | null;
    certificationsLicenses: string | null;
    languagesSpoken: string | null;
    driversLicense: string | null;
    currentlyEmployed: string | null;
  };
  autofillProfile: ApplicantProfile['autofillProfile'];
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
  requiredSources: FieldRequiredSource[];
  enabled: boolean;
  options: ScrapedApplicationFieldOption[];
  optionMode: FieldOptionMode;
  answerability: PromptFieldAnswerability;
  guidance: string;
  intent?: PromptFieldIntent;
  targetCountryCode?: string | null;
  specialHandling?: string;
};

export type PromptFieldAnswerability =
  | 'direct_profile'
  | 'structured_profile'
  | 'conditional_follow_up'
  | 'open_ended_best_effort'
  | 'unsupported_or_unanswerable';

export type PromptFieldIntent =
  | 'professional_experience_yes_no'
  | 'company_relationship_yes_no'
  | 'heard_about_company'
  | 'company_interest'
  | 'company_values_resonance'
  | 'achievement_narrative'
  | 'stakeholder_collaboration_example'
  | 'technical_experience_narrative'
  | 'consent_or_notice'
  | 'lgbtqia_identification';

export type ApplicationFillPlanDiagnosticCategory =
  | 'accepted'
  | 'schema_mismatch'
  | 'unsupported_field_type'
  | 'missing_profile_fact'
  | 'model_uncertainty'
  | 'normalization_rejection'
  | 'best_effort_negative_inference'
  | 'required_best_effort_default'
  | 'resume_grounded_best_effort'
  | 'policy_default_consent'
  | 'profile_default_sensitive_response';

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
  jobCountryContext: {
    jobLocationRaw: string;
    normalizedJobCountryCode: string | null;
  };
  applicantProfile: SerializedApplicantProfile;
  fields: PromptField[];
};

export type ApplicationFillPlanRepairPromptPayload = ApplicationFillPlanPromptPayload & {
  repair: {
    reason: 'missing_required_fields_after_initial_plan';
    invalidItems: ApplicationFillPlanMissingRequiredField[];
    originalItems: ApplicationFillPlanEntry[];
  };
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

function toNullableEnumValue<T extends string>(value: T | ''): T | null {
  return value === '' ? null : value;
}

function cleanupResumeLine(value: string): string {
  return value
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .trim();
}

function stripLatexToPlainText(rawLatex: string): string {
  return rawLatex
    .replace(/%.*$/gm, ' ')
    .replace(/\\item/g, '\n')
    .replace(/\\href\{[^}]*\}\{([^}]*)\}/g, '$1')
    .replace(/\\(?:textbf|textit|emph|underline|section|subsection|subsubsection)\*?\{([^}]*)\}/g, '$1')
    .replace(/\\[a-zA-Z]+\*?(?:\[[^\]]*\])?/g, ' ')
    .replace(/[{}]/g, ' ')
    .replace(/[&_~^$]/g, ' ')
    .replace(/\r/g, '\n');
}

function extractResumeLines(rawLatex: string): string[] {
  return stripLatexToPlainText(rawLatex)
    .split('\n')
    .map(cleanupResumeLine)
    .filter((line) => line.length >= 12);
}

function extractMatchingResumeLines(lines: string[], pattern: RegExp, limit = 4): string[] {
  const matches = lines.filter((line) => pattern.test(line));
  return Array.from(new Set(matches)).slice(0, limit);
}

function extractResumeTechnologies(resumeText: string): string[] {
  const normalized = normalizeTextForMatching(resumeText);
  return RESUME_TECHNOLOGY_KEYWORDS.filter((keyword) =>
    normalized.includes(normalizeTextForMatching(keyword))
  );
}

function buildResumeContext(applicantProfile: ApplicantProfile | null): ResumeContext {
  const baseResumeTex = applicantProfile?.baseResumeTex.trim() ?? '';
  if (baseResumeTex.length === 0) {
    return {
      available: false,
      recentRoles: [],
      technologies: [],
      projectSignals: [],
      achievementSignals: [],
      stakeholderSignals: [],
      excerpt: '',
      hasProfessionalRoleSignals: false
    };
  }

  const lines = extractResumeLines(baseResumeTex);
  const excerpt = truncate(lines.slice(0, MAX_RESUME_LINES).join('\n'), MAX_RESUME_EXCERPT_CHARS);
  const technologies = extractResumeTechnologies(excerpt);
  const recentRoles = extractMatchingResumeLines(
    lines,
    /\b(engineer|developer|intern|analyst|consultant|manager|lead|specialist|co-op)\b/i
  );
  const projectSignals = extractMatchingResumeLines(
    lines,
    /\b(project|platform|tool|pipeline|application|service|system|automation|backend|database)\b/i,
    6
  );
  const achievementSignals = extractMatchingResumeLines(
    lines,
    /\b(built|designed|developed|delivered|launched|led|improved|automated|reduced|saved|implemented)\b/i,
    6
  );
  const stakeholderSignals = extractMatchingResumeLines(
    lines,
    /\b(stakeholder|product|operations|customer|cross-functional|collaborat|partnered)\b/i,
    4
  );

  return {
    available: true,
    recentRoles,
    technologies,
    projectSignals,
    achievementSignals,
    stakeholderSignals,
    excerpt,
    hasProfessionalRoleSignals: recentRoles.length > 0
  };
}

function serializeApplicantProfile(
  applicantProfile: ApplicantProfile | null
): SerializedApplicantProfile {
  const resumeContext = buildResumeContext(applicantProfile);
  const resumeLatex: ResumeLatexContext = {
    available: (applicantProfile?.baseResumeTex.trim().length ?? 0) > 0,
    fileName: applicantProfile?.baseResumeFileName.trim() || null,
    tex: truncate(applicantProfile?.baseResumeTex ?? '', MAX_RESUME_LATEX_CHARS)
  };
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
      resumeLatex,
      resumeContext,
      preferredCountries: [],
      completionPolicyDefaults: {
        consentToInterviewRecording: null,
        acceptApplicationPrivacyNotices: null,
        consentToDemographicDataProcessing: null,
        lgbtqiaCommunityIdentification: null
      },
      workAuthorization: {
        authorizedWithoutSponsorshipCountryCodes: [],
        requiresSponsorship: null,
        requiresSponsorshipCountryCodes: [],
        currentCountryCode: null,
        primaryCitizenshipCountryCode: null,
        currentCountryResidenceStatus: null,
        currentCountryResidenceStatusOther: null,
        legallyAuthorizedInCurrentCountry: null,
        needsSponsorshipInCurrentCountry: null,
        clearanceStatus: null,
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
        highestEducationStartYear: null,
        highestEducationEndYear: null,
        certificationsLicenses: null,
        languagesSpoken: null,
        driversLicense: null,
        currentlyEmployed: null
      },
      autofillProfile: { ...defaultMinimalAutofillProfile },
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
    resumeLatex,
    resumeContext,
    preferredCountries: applicantProfile.preferredCountries,
    completionPolicyDefaults: {
      consentToInterviewRecording: toNullableEnumValue(
        autofillProfile.consentToInterviewRecording
      ),
      acceptApplicationPrivacyNotices: toNullableEnumValue(
        autofillProfile.acceptApplicationPrivacyNotices
      ),
      consentToDemographicDataProcessing: toNullableEnumValue(
        autofillProfile.consentToDemographicDataProcessing
      ),
      lgbtqiaCommunityIdentification: toNullableEnumValue(
        autofillProfile.lgbtqiaCommunityIdentification
      )
    },
    workAuthorization: {
      authorizedWithoutSponsorshipCountryCodes: parseWorkAuthorizationCountriesCsv(
        autofillProfile.workAuthorizationCountriesCsv
      ),
      requiresSponsorship,
      requiresSponsorshipCountryCodes: parseWorkAuthorizationCountriesCsv(
        autofillProfile.requiresSponsorshipCountriesCsv
      ),
      currentCountryCode: autofillProfile.currentCountryCode || null,
      primaryCitizenshipCountryCode: autofillProfile.primaryCitizenshipCountryCode || null,
      currentCountryResidenceStatus: autofillProfile.currentCountryResidenceStatus || null,
      currentCountryResidenceStatusOther:
        autofillProfile.currentCountryResidenceStatusOther.trim() || null,
      legallyAuthorizedInCurrentCountry: autofillProfile.legallyAuthorizedInCurrentCountry || null,
      needsSponsorshipInCurrentCountry: autofillProfile.needsSponsorshipInCurrentCountry || null,
      clearanceStatus: autofillProfile.clearanceStatus || null,
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
      highestEducationStartYear: autofillProfile.highestEducationStartYear.trim() || null,
      highestEducationEndYear: autofillProfile.highestEducationEndYear.trim() || null,
      certificationsLicenses: autofillProfile.certificationsLicenses.trim() || null,
      languagesSpoken: autofillProfile.languagesSpoken.trim() || null,
      driversLicense: autofillProfile.driversLicense || null,
      currentlyEmployed: autofillProfile.currentlyEmployed || null
    },
    autofillProfile: { ...autofillProfile },
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
    resumeLatex: {
      available: serializedProfile.resumeLatex.available,
      fileName: serializedProfile.resumeLatex.fileName,
      texLength: serializedProfile.resumeLatex.tex.length
    },
    resumeContext: {
      available: serializedProfile.resumeContext.available,
      recentRoleCount: serializedProfile.resumeContext.recentRoles.length,
      technologyCount: serializedProfile.resumeContext.technologies.length,
      stakeholderSignalCount: serializedProfile.resumeContext.stakeholderSignals.length
    },
    preferredCountryCount: serializedProfile.preferredCountries.length,
    completionPolicyDefaults: serializedProfile.completionPolicyDefaults,
    workAuthorization: {
      authorizedCountryCount:
        serializedProfile.workAuthorization.authorizedWithoutSponsorshipCountryCodes.length,
      requiresSponsorship: serializedProfile.workAuthorization.requiresSponsorship,
      sponsorshipCountryCount:
        serializedProfile.workAuthorization.requiresSponsorshipCountryCodes.length,
      currentCountryCode: serializedProfile.workAuthorization.currentCountryCode,
      primaryCitizenshipCountryCode: serializedProfile.workAuthorization.primaryCitizenshipCountryCode,
      currentCountryResidenceStatus: serializedProfile.workAuthorization.currentCountryResidenceStatus,
      clearanceStatus: serializedProfile.workAuthorization.clearanceStatus
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

function isEffectivelyRequired(
  field: Pick<ScrapedApplicationField, 'id' | 'required' | 'label' | 'requiredSources'>
): boolean {
  return isFieldRequired({
    id: field.id,
    label: field.label,
    required: field.required,
    ...(field.requiredSources !== undefined ? { requiredSources: field.requiredSources } : {})
  });
}

function isRequiredNonFileField(field: ScrapedApplicationField): boolean {
  return isEffectivelyRequired(field) && field.type !== 'file';
}

function inferCountryCodeFromText(value: string): string | null {
  const normalizedValue = normalizeTextForMatching(value);
  if (normalizedValue.length === 0) {
    return null;
  }

  const matches = FILTER_COUNTRIES.filter((country) =>
    getCountrySearchTokens(country.code).some((token) => normalizedValue.includes(token))
  );

  return matches.length === 1 ? matches[0]?.code ?? null : null;
}

function countryLabelForCode(countryCode: string | null): string | null {
  if (!countryCode) {
    return null;
  }

  return FILTER_COUNTRIES.find((country) => country.code === countryCode)?.label ?? countryCode;
}

function isPhoneCountryCodeField(fingerprint: string): boolean {
  return includesAny(fingerprint, ['phone']) && includesAny(fingerprint, ['country', 'code', 'prefix']);
}

function phoneCountryFallbackValue(
  field: ScrapedApplicationField,
  serializedProfile: SerializedApplicantProfile
): string | null {
  const candidates = [
    countryLabelForCode(serializedProfile.workAuthorization.currentCountryCode),
    countryLabelForCode(serializedProfile.workAuthorization.primaryCitizenshipCountryCode),
    countryLabelForCode(inferCountryCodeFromText(serializedProfile.identity.location))
  ].filter((value): value is string => Boolean(value));

  return selectorAlignedLabel(field, candidates) ?? candidates[0] ?? null;
}

function isWorkAuthorizationPrompt(fingerprint: string): boolean {
  return includesAny(fingerprint, [
    'work authorization',
    'authorized to work',
    'legally authorized',
    'legally entitled to work',
    'legally eligible to work',
    'eligible to work',
    'entitled to work',
    'work for any employer',
    'sponsorship',
    'sponsor',
    'visa',
    'work permit'
  ]);
}

function isProfessionalExperienceBinaryPrompt(fingerprint: string): boolean {
  return (
    includesAny(fingerprint, ['professional setting', 'professionally']) &&
    includesAny(fingerprint, [
      'do you have',
      'have you',
      'hands-on experience',
      'developed, maintained',
      'production-ready backend',
      'experience working with'
    ])
  );
}

function isCompanyRelationshipPrompt(fingerprint: string): boolean {
  if (isWorkAuthorizationPrompt(fingerprint)) {
    return false;
  }

  return includesAny(fingerprint, [
    'history with',
    'ever been employed by',
    'previously been employed by',
    'previously employed by',
    'prior employment',
    'worked for',
    'work for',
    'company that',
    'has acquired',
    'acquired company',
    'conflict of interest',
    'family member',
    'relative',
    'relationship with',
    'relationship to',
    'relationship at',
    'currently employed by',
    'former employee'
  ]);
}

function isConsentOrNoticePrompt(fingerprint: string): boolean {
  return includesAny(fingerprint, [
    'consent',
    'privacy notice',
    'notice at collection',
    'acknowledge',
    'acknowledgement',
    'record and auto-transcript',
    'demographic data',
    'self-identification data'
  ]);
}

function isLgbtqiaIdentificationPrompt(fingerprint: string): boolean {
  return includesAny(fingerprint, [
    'sexual orientation',
    'lesbian',
    'bisexual',
    'transgender',
    'queer',
    'intersex',
    'asexual',
    'lgbtqia'
  ]);
}

function detectFieldIntent(field: ScrapedApplicationField): PromptFieldIntent | null {
  const fingerprint = `${field.id} ${field.label}`;

  if (isProfessionalExperienceBinaryPrompt(fingerprint)) {
    return 'professional_experience_yes_no';
  }

  if (isCompanyRelationshipPrompt(fingerprint)) {
    return 'company_relationship_yes_no';
  }

  if (isConsentOrNoticePrompt(fingerprint)) {
    return 'consent_or_notice';
  }

  if (isLgbtqiaIdentificationPrompt(fingerprint)) {
    return 'lgbtqia_identification';
  }

  if (includesAny(fingerprint, ['how did you hear about', 'heard about'])) {
    return 'heard_about_company';
  }

  if (
    includesAny(fingerprint, [
      'why are you interested',
      'interested in working',
      'what makes you interested',
      'why do you want to work',
      'why do you want to join',
      'what excites you'
    ])
  ) {
    return 'company_interest';
  }

  if (includesAny(fingerprint, ['values', 'resonate', 'resonates', 'mission'])) {
    return 'company_values_resonance';
  }

  if (includesAny(fingerprint, ['achievement', 'accomplishment', 'proud of', 'tell us about a time'])) {
    return 'achievement_narrative';
  }

  if (
    includesAny(fingerprint, [
      'stakeholder',
      'cross-functional',
      'collaboration',
      'collaborate',
      'partner with'
    ])
  ) {
    return 'stakeholder_collaboration_example';
  }

  if (
    includesAny(fingerprint, [
      'technical experience',
      'experience with',
      'describe your experience',
      'engineering experience'
    ])
  ) {
    return 'technical_experience_narrative';
  }

  return null;
}

function skipCategoryForAnswerability(
  answerability: PromptFieldAnswerability
): ApplicationFillPlanDiagnosticCategory {
  switch (answerability) {
    case 'structured_profile':
    case 'conditional_follow_up':
      return 'missing_profile_fact';
    case 'direct_profile':
    case 'open_ended_best_effort':
    case 'unsupported_or_unanswerable':
      return 'model_uncertainty';
  }
}

function classifyFieldAnswerability(field: ScrapedApplicationField): PromptFieldAnswerability {
  const fingerprint = `${field.id} ${field.label}`;
  const intent = detectFieldIntent(field);

  if (
    includesAny(fingerprint, ['if other', 'please specify', 'if you have held']) ||
    normalizeTextForMatching(field.label).startsWith('if ')
  ) {
    return 'conditional_follow_up';
  }

  if (
    intent === 'professional_experience_yes_no' ||
    intent === 'company_relationship_yes_no' ||
    intent === 'heard_about_company' ||
    intent === 'company_interest' ||
    intent === 'company_values_resonance' ||
    intent === 'achievement_narrative' ||
    intent === 'stakeholder_collaboration_example' ||
    intent === 'technical_experience_narrative'
  ) {
    return 'open_ended_best_effort';
  }

  if (intent === 'consent_or_notice' || intent === 'lgbtqia_identification') {
    return 'structured_profile';
  }

  if (
    isWorkAuthorizationPrompt(fingerprint) ||
    includesAny(fingerprint, [
      'citizen',
      'citizenship',
      'residence status',
      'clearance',
      'export control',
      'consent',
      'privacy',
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

  return 'unsupported_or_unanswerable';
}

function guidanceForAnswerability(
  answerability: PromptFieldAnswerability,
  intent: PromptFieldIntent | null,
  targetCountryCode: string | null
): string {
  if (intent === 'professional_experience_yes_no') {
    return [
      'Use applicant summary, reusable context, resumeContext, and structured profile facts.',
      'Use resumeLatex.tex as the raw LaTeX resume source when detailed resume evidence is needed.',
      'Answer Yes only when those sources show clear professional evidence for the asked experience.',
      'Otherwise answer No.',
      'Do not hallucinate employers, projects, years, systems, or technologies.'
    ].join(' ');
  }

  if (intent === 'company_relationship_yes_no') {
    return [
      'Use applicant summary, reusable context, resumeLatex.tex, resumeContext, and structured profile facts for company-history, prior-employment, acquired-company employment, conflict-of-interest, family, relative, and relationship-with-company prompts.',
      'Answer Yes only when those sources contain explicit evidence for the asked relationship, employment history, or conflict.',
      'Otherwise answer No.',
      'Do not hallucinate employers, family relationships, conflicts, acquired-company history, or professional affiliations.'
    ].join(' ');
  }

  if (intent === 'consent_or_notice') {
    return [
      'Use applicantProfile.completionPolicyDefaults for required consent, privacy, and notice prompts.',
      'If the specific profile value is unset, default to Yes.',
      'Required consent, privacy, and notice prompts must receive a best-effort answer so the application can continue.'
    ].join(' ');
  }

  if (intent === 'lgbtqia_identification') {
    return [
      'Use applicantProfile.completionPolicyDefaults.lgbtqiaCommunityIdentification when set.',
      'If it is unset, default to No.',
      'Required non-file fields must receive the best grounded answer available.'
    ].join(' ');
  }

  switch (answerability) {
    case 'direct_profile':
      return 'Answer directly from the applicant identity/profile facts when available.';
    case 'structured_profile':
      return [
        'Answer only from structured applicant facts and structured legal-status fields.',
        targetCountryCode
          ? `Treat ${targetCountryCode} as the target country inferred from the field wording.`
          : 'If the question refers to the work country or job location, use jobCountryContext.normalizedJobCountryCode when available.',
        'Do not guess security clearance, export-control eligibility, citizenship in an unrelated country, or consent/privacy acknowledgements.'
      ].join(' ');
    case 'conditional_follow_up':
      return 'Answer only when a prerequisite answer is explicitly grounded. Otherwise leave the optional follow-up unsupported.';
    case 'open_ended_best_effort':
      if (intent === 'heard_about_company') {
        return 'Answer with the best available grounded source. If no explicit source exists in profile or context, default to LinkedIn.';
      }

      return [
        'Answer with the strongest grounded synthesis from applicant summary, reusable context, resumeContext, qualifications, preferences, and job/company context.',
        'Use resumeLatex.tex as the full LaTeX resume source when resumeContext is too compressed.',
        'Use grounded synthesis even when the profile lacks an exact matching sentence.',
        'Do not invent employers, projects, systems, years, achievements, or technologies that are not supported by resume/profile context.',
        'If the question asks about professional work, do not upgrade student or personal work into professional experience unless the resume/profile clearly frames it that way.'
      ].join(' ');
    case 'unsupported_or_unanswerable':
      return 'Required non-file fields must receive the best grounded answer available inferred from attached context; optional unsupported fields may remain unsupported when no grounded answer is available.';
  }
}

function toPromptField(field: ScrapedApplicationField): PromptField {
  const answerability = classifyFieldAnswerability(field);
  const intent = detectFieldIntent(field);
  const targetCountryCode = inferCountryCodeFromText(`${field.id} ${field.label}`);
  const required = isEffectivelyRequired(field);

  return {
    id: field.id,
    label: field.label,
    type: field.type,
    required,
    requiredSources: field.requiredSources ?? [],
    enabled: field.enabled,
    options: field.options,
    optionMode: field.optionMode ?? (field.options.length > 0 ? 'static' : 'none'),
    answerability,
    guidance: guidanceForAnswerability(answerability, intent, targetCountryCode),
    ...(intent ? { intent } : {}),
    ...(targetCountryCode ? { targetCountryCode } : {}),
    ...(field.specialHandling ? { specialHandling: field.specialHandling } : {})
  };
}

function buildSystemPrompt(): string {
  return [
    'You create a structured application fill plan for a single job-board page state.',
    `Prompt version: ${STAGE_4_PROMPT_VERSION}.`,
    'Use only the applicant profile facts and the scraped field definitions provided by the user.',
    'Use best-effort grounded synthesis for open-ended motivation and narrative questions when the applicant profile, resumeLatex, and resumeContext give enough context to answer plausibly.',
    'Never invent employers, projects, years, achievements, technologies, legal status, security clearance, export-control eligibility, or demographic facts.',
    'Required non-file fields are mandatory. Never return null or empty string for them.',
    'For each required field, use direct applicant profile evidence first. If no direct evidence exists, infer the best possible answer from profile, resume, job, and available options, and set evidenceMode to "inferred_required".',
    'Optional fields that are uncertain or unsupported may remain unsupported with a short reason.',
    'Action rules:',
    '- text, email, tel, textarea, rich_text => action "fill" with a string value.',
    '- combobox with optionMode "static" and options => action "fill"; selectedOptionValue must exactly equal one provided option.value, selectedOptionLabel should be that option.label, and value should be the option label.',
    '- combobox with optionMode "dynamic_search" => action "fill"; searchText must contain the exact text to type, selectedOptionLabel should be the intended visible option when known, and value should equal searchText.',
    '- select => action "select" with an exact option value from the provided options.',
    '- checkbox => action "check" with a boolean value.',
    '- checkbox_group => action "check" with an array of exact option values.',
    '- radio_group => action "click" with an exact option value.',
    '- file uploads are handled later, so use action "skip".',
    'Open-ended best-effort rules:',
    '- For "How did you hear about us?" style prompts, use an explicit source from profile/context when available; otherwise answer LinkedIn.',
    '- For professional yes/no experience prompts, answer Yes only if summary, reusableContext, resumeLatex, or resumeContext shows clear professional evidence. Otherwise answer No.',
    '- For company-history, prior-employment, acquired-company employment, conflict-of-interest, family, relative, and relationship-with-company prompts, answer Yes only with explicit profile or resume evidence. Otherwise answer No.',
    '- For motivation, values, achievement, stakeholder, and technical-experience prompts, synthesize from applicant summary, reusable context, resumeLatex, resumeContext, qualifications, preferences, and the job/company context even when there is no exact matching sentence.',
    '- For experience-oriented answers, stay conservative when evidence is partial and use the closest grounded example available.',
    'Consent and notice policy rules:',
    '- Use applicantProfile.completionPolicyDefaults for interview recording, privacy notice, notice-at-collection, and demographic-data-processing prompts.',
    '- If those profile values are unset, default required consent/privacy/notice prompts to Yes so the application can continue.',
    '- Use applicantProfile.completionPolicyDefaults.lgbtqiaCommunityIdentification for LGBTQIA community-identification prompts. If unset, default to No.',
    'Structured legal reasoning rules:',
    '- authorizedWithoutSponsorshipCountryCodes lists countries where the candidate can work without sponsorship.',
    '- requiresSponsorship tells you whether the candidate needs sponsorship now or later when asked generally.',
    '- currentCountryCode, primaryCitizenshipCountryCode, currentCountryResidenceStatus, legallyAuthorizedInCurrentCountry, and needsSponsorshipInCurrentCountry describe the applicant status in their current country.',
    '- If the field wording names a country explicitly, use that country first. Otherwise, for questions about the work country or job location, use jobCountryContext.normalizedJobCountryCode when available.',
    '- If the target country matches currentCountryCode, treat citizen, permanent_resident, open_work_permit, and employer_specific_work_visa as strong evidence of legal work/live status there.',
    '- If the target country matches primaryCitizenshipCountryCode, citizenship can support citizenship and legal-work answers there.',
    '- If authorizedWithoutSponsorshipCountryCodes contains the target country, that supports a "yes" answer to work authorization without sponsorship.',
    '- If requiresSponsorshipCountryCodes contains the target country, or needsSponsorshipInCurrentCountry is yes for the current country, that supports a "yes" answer to sponsorship-needed questions.',
    '- If the field asks about a country not covered by structured facts and the field is required and non-file, provide the conservative best-effort answer available.',
    'Exact option rules:',
    '- For select, radio_group, checkbox_group, and static combobox fields, choose only from the provided options array.',
    '- For select and static combobox fields, return EXACTLY one provided option for required fields. Do not improvise, paraphrase, summarize, or return near-match text.',
    '- Never answer generic "Yes"/"No" unless that exact token exists as one of the field options.',
    '- Treat applicantProfile as reference context for selector fields, not as selectable text. Never copy a profile value into select, radio_group, checkbox_group, or static combobox unless it exactly matches a provided option value or label.',
    '- Selector fields are strict: if profile says "Computer Engineering" but options are degree levels, use that profile fact only to choose the closest provided option such as "Bachelor\'s Degree"; do not return "Computer Engineering".',
    '- If no exact option can be grounded, return action "skip" with a concise reason that exact option selection was not possible.',
    '- Prefer option.value for value on select/radio/checkbox_group. For static combobox, selectedOptionValue must be exact option.value and value/search text should use the chosen option label.',
    '- If a required selector field has no direct profile evidence, choose the safest available option, usually a truthful No, Prefer not to say, Choose not to disclose, LinkedIn, or closest profile-backed option.',
    '- "When are you available to join/start?" asks for a date or availability window. Use applicantProfile.workAuthorization.startDate or noticePeriod. Never answer yes/no.',
    'Return JSON only with shape { "items": [...] }.',
    'Every item must include fieldId, action, value, selectedOptionValue, selectedOptionLabel, searchText, evidenceMode, evidenceRefs, confidence, and skipReason.',
    'When action is not "skip", keep skipReason as an empty string.',
    'Use evidenceMode "direct_profile" for direct profile facts, "policy_default" for configured/default consent or demographic policy, "inferred_required" for required best-effort inference, and "unsupported_optional" only for optional skips.',
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
    jobCountryContext: {
      jobLocationRaw: input.job.location,
      normalizedJobCountryCode: inferCountryCodeFromText(input.job.location)
    },
    applicantProfile: input.serializedProfile,
    fields: input.fields.map(toPromptField)
  };
}

function buildPrompt(promptPayload: ApplicationFillPlanPromptPayload): string {
  return JSON.stringify(promptPayload, null, 2);
}

function buildRepairSystemPrompt(): string {
  return [
    buildSystemPrompt(),
    '',
    'Repair mode:',
    '- You are receiving only required fields that failed validation after the previous answer.',
    '- Return answers only for those repair.fields.',
    '- For each required static selector field, return EXACTLY one of the provided options (value/label) and nothing else.',
    '- Do not output generic yes/no unless yes/no is an exact available option.',
    '- If exact selection is impossible, return action "skip" with a concise reason.',
    '- Do not answer fields not present in repair.fields.',
    '- For each failed dynamic combobox, provide non-empty searchText and value.',
    '- Use the validator reason to correct the specific failure.'
  ].join('\n');
}

function buildRepairPromptPayload(input: {
  promptPayload: ApplicationFillPlanPromptPayload;
  missingRequiredFields: ApplicationFillPlanMissingRequiredField[];
  originalItems: ApplicationFillPlanEntry[];
}): ApplicationFillPlanRepairPromptPayload {
  const missingIds = new Set(input.missingRequiredFields.map((field) => field.fieldId));
  return {
    ...input.promptPayload,
    fields: input.promptPayload.fields.filter((field) => missingIds.has(field.id)),
    repair: {
      reason: 'missing_required_fields_after_initial_plan',
      invalidItems: input.missingRequiredFields,
      originalItems: input.originalItems.filter((item) => missingIds.has(item.fieldId))
    }
  };
}

function mergeFillPlanItems(
  originalItems: ApplicationFillPlanEntry[],
  repairItems: ApplicationFillPlanEntry[]
): ApplicationFillPlanEntry[] {
  const byFieldId = new Map<string, ApplicationFillPlanEntry>();
  for (const item of originalItems) {
    byFieldId.set(item.fieldId, item);
  }
  for (const item of repairItems) {
    byFieldId.set(item.fieldId, item);
  }

  return Array.from(byFieldId.values());
}

function resolveBinaryYesNoOptionPair(options: ScrapedApplicationFieldOption[]): {
  yes: ScrapedApplicationFieldOption;
  no: ScrapedApplicationFieldOption;
} | null {
  const yesOpt =
    options.find((option) => /^yes$/i.test(option.label.trim())) ??
    options.find((option) => /^yes$/i.test(String(option.value ?? '').trim()));
  const noOpt =
    options.find((option) => /^no$/i.test(option.label.trim())) ??
    options.find((option) => /^no$/i.test(String(option.value ?? '').trim()));
  return yesOpt && noOpt ? { yes: yesOpt, no: noOpt } : null;
}

function synthesizeFallbackEntryForUnresolvedRequiredChoice(
  field: ScrapedApplicationField
): ApplicationFillPlanEntry | null {
  const questionText = `${field.label}`.toLowerCase();
  if (
    /\bethnic(?:ity|ities)?|\bracial\b|\brace\b|\bgender\b|\bpronoun\b|\borientation\b|\bdisabilit/i.test(
      questionText
    )
  ) {
    return null;
  }

  if (field.type === 'checkbox') {
    const idHint =
      /\bcards\[.+\]\[field\d+\]/i.test(field.id) ||
      /\bauthorize|authorised|eligible|truthful|certif|privacy|policy|acknowledge\b/i.test(
        `${field.label}`
      );

    const attestation =
      /\b(i\s+certify|i\s+confirm|i\s+acknowledge|i\s+agree)\b/i.test(questionText);

    if (!idHint && !attestation) {
      return null;
    }

    const marketingOptOut =
      /\b(?:marketing|promotional)\b/i.test(questionText) ||
      /\bnewsletter\b/i.test(questionText);

    const value = marketingOptOut ? false : true;

    return {
      fieldId: field.id,
      action: 'check',
      value,
      confidence: 0.5,
      skipReason:
        'synthetic_checkbox_fallback: deterministic acknowledgement checkbox for unresolved required legal/consent capture'
    };
  }

  if (field.type === 'radio_group') {
    const pair = resolveBinaryYesNoOptionPair(field.options);
    if (!pair) {
      return null;
    }

    const pickNegative =
      /\b(?:not\s+eligible|ineligible)\b|\bunable\s+to\b|\bare\s+you\s+not\b/.test(questionText);

    const chosen = pickNegative ? pair.no : pair.yes;
    return {
      fieldId: field.id,
      action: 'click',
      value: chosen.value,
      confidence: 0.54,
      skipReason:
        'synthetic_binary_fallback: deterministic yes/no selection for unresolved required radio group'
    };
  }

  if (field.type === 'checkbox_group') {
    const pair = resolveBinaryYesNoOptionPair(field.options);
    if (pair) {
      const pickNegative =
        /\b(?:not\s+eligible|ineligible)\b|\bunable\s+to\b|\bare\s+you\s+not\b/.test(questionText);

      const chosenValues = pickNegative ? [pair.no.value] : [pair.yes.value];
      return {
        fieldId: field.id,
        action: 'check',
        value: chosenValues,
        confidence: 0.54,
        skipReason:
          'synthetic_binary_fallback: deterministic yes/no selection for unresolved required checkbox group'
      };
    }

    if (field.options.length === 0 || field.options.length > 14) {
      return null;
    }

    const yesLike =
      field.options.find((option) => /^yes$/i.test(option.label.trim())) ??
      field.options.find((option) => /^yes$/i.test(String(option.value ?? '').trim())) ??
      field.options.find((option) => /^i (?:certify|acknowledge|agree)\b/i.test(option.label.trim()));
    if (!yesLike) {
      return null;
    }

    return {
      fieldId: field.id,
      action: 'check',
      value: [yesLike.value],
      confidence: 0.52,
      skipReason:
        'synthetic_yes_fallback: affirmative selection for unresolved required non-demographic checkbox group'
    };
  }

  return null;
}

function buildSyntheticEntriesForMissingRequiredChoices(input: {
  fields: ScrapedApplicationField[];
  missing: ApplicationFillPlanMissingRequiredField[];
}): ApplicationFillPlanEntry[] {
  const out: ApplicationFillPlanEntry[] = [];
  for (const miss of input.missing) {
    const field = input.fields.find((candidate) => candidate.id === miss.fieldId);
    if (!field || !isFieldRequired(field)) {
      continue;
    }

    const entry = synthesizeFallbackEntryForUnresolvedRequiredChoice(field);
    if (entry) {
      out.push(entry);
    }
  }

  return out;
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

function optionAliases(candidate: string, field?: ScrapedApplicationField): string[] {
  const normalizedCandidate = normalizeForComparison(candidate);
  const aliases = new Set([normalizedCandidate]);
  const compactCandidate = normalizedCandidate.replace(/[^a-z0-9]+/g, '');
  const fieldFingerprint = field ? normalizeTextForMatching(`${field.id} ${field.label}`) : '';
  const candidateFingerprint = normalizeTextForMatching(candidate);

  if (field && isWorkAuthorizationPrompt(fieldFingerprint)) {
    const isSponsorshipQuestion = includesAny(fieldFingerprint, ['sponsorship', 'sponsor']);
    const hasPositiveAuthorization =
      includesAny(candidateFingerprint, [
        'yes',
        'authorized',
        'eligible',
        'entitled',
        'work for any employer'
      ]) &&
      !includesAny(candidateFingerprint, ['not authorized', 'not eligible', 'not entitled', 'require sponsorship']);
    const hasSponsorshipRequirement = includesAny(candidateFingerprint, [
      'require sponsorship',
      'requires sponsorship',
      'need sponsorship',
      'needs sponsorship',
      'would require sponsorship'
    ]);
    const hasNegativeSponsorship = includesAny(candidateFingerprint, [
      'no sponsorship',
      'not require sponsorship',
      'do not require sponsorship',
      'does not require sponsorship',
      'without sponsorship'
    ]);

    if (isSponsorshipQuestion) {
      if (normalizedCandidate === 'yes' || hasSponsorshipRequirement) {
        aliases.add('yes');
      }
      if (normalizedCandidate === 'no' || hasNegativeSponsorship) {
        aliases.add('no');
      }
    } else {
      if (normalizedCandidate === 'yes' || hasPositiveAuthorization) {
        aliases.add('yes');
      }
      if (normalizedCandidate === 'no' || hasSponsorshipRequirement) {
        aliases.add('no');
      }
    }
  }

  if (
    field &&
    isConsentOrNoticeFieldFingerprint(normalizeTextForMatching(`${field.id} ${field.label}`)) &&
    (normalizedCandidate === 'yes' || compactCandidate === 'yes')
  ) {
    aliases.add('acknowledge');
    aliases.add('acknowledgement');
  }

  if (['bachelor', 'bachelors', 'bachelorsdegree', 'bs', 'bsc', 'ba'].includes(compactCandidate)) {
    aliases.add("bachelor's degree");
    aliases.add('bachelor degree');
    aliases.add('bachelors degree');
  }

  if (['master', 'masters', 'mastersdegree', 'ms', 'msc', 'ma'].includes(compactCandidate)) {
    aliases.add("master's degree");
    aliases.add('master degree');
    aliases.add('masters degree');
  }

  if (['associate', 'associates', 'associatesdegree'].includes(compactCandidate)) {
    aliases.add("associate's degree");
    aliases.add('associate degree');
    aliases.add('associates degree');
  }

  if (['phd', 'doctorofphilosophy', 'doctorate'].includes(compactCandidate)) {
    aliases.add('doctor of philosophy (ph.d.)');
    aliases.add('doctor of philosophy');
    aliases.add('ph.d.');
  }

  if (['highschool', 'secondaryschool'].includes(compactCandidate)) {
    aliases.add('high school');
  }

  if (
    ['prefer not to say', 'prefer not to disclose', 'choose not to disclose'].includes(
      normalizedCandidate
    )
  ) {
    aliases.add('prefer not to say');
    aliases.add('prefer not to disclose');
    aliases.add('choose not to disclose');
    aliases.add('decline to disclose');
  }

  return Array.from(aliases);
}

function resolveOptionValue(
  options: ScrapedApplicationFieldOption[],
  candidate: string,
  field?: ScrapedApplicationField
): string | null {
  const candidateAliases = optionAliases(candidate, field);
  if (candidateAliases.length === 0 || candidateAliases[0]?.length === 0) {
    return null;
  }

  for (const option of options) {
    const optionValueAliases = optionAliases(option.value, field);
    if (optionValueAliases.some((alias) => candidateAliases.includes(alias))) {
      return option.value;
    }

    const optionLabelAliases = optionAliases(option.label, field);
    if (optionLabelAliases.some((alias) => candidateAliases.includes(alias))) {
      return option.value;
    }
  }

  const countryCode = inferCountryCodeFromText(candidate);
  if (countryCode) {
    const countryTokens = getCountrySearchTokens(countryCode);
    for (const option of options) {
      const normalizedOption = normalizeTextForMatching(`${option.value} ${option.label}`);
      if (countryTokens.some((token) => normalizedOption.includes(token))) {
        return option.value;
      }
    }
  }

  return null;
}

function optionForResolvedValue(
  options: ScrapedApplicationFieldOption[],
  value: string
): ScrapedApplicationFieldOption | null {
  return options.find((option) => option.value === value) ?? null;
}

function resolveOptionFromCandidates(
  options: ScrapedApplicationFieldOption[],
  candidates: Array<string | null | undefined>,
  field?: ScrapedApplicationField
): ScrapedApplicationFieldOption | null {
  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    const optionValue = resolveOptionValue(options, candidate, field);
    const option = optionValue ? optionForResolvedValue(options, optionValue) : null;
    if (option) {
      return option;
    }
  }

  return null;
}

function selectorAlignedLabel(
  field: ScrapedApplicationField,
  candidates: Array<string | null | undefined>
): string | null {
  if (field.options.length === 0) {
    return candidates.find((candidate) => (candidate?.trim().length ?? 0) > 0)?.trim() ?? null;
  }

  const option = resolveOptionFromCandidates(field.options, candidates, field);
  return option ? option.label || option.value : null;
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

function entryStringCandidates(entry: ApplicationFillPlanEntry): string[] {
  return [
    entry.selectedOptionValue ?? '',
    entry.selectedOptionLabel ?? '',
    entry.searchText ?? '',
    typeof entry.value === 'string' ? entry.value : ''
  ].map((value) => value.trim()).filter(Boolean);
}

function firstEntryString(entry: ApplicationFillPlanEntry): string | null {
  return entryStringCandidates(entry)[0] ?? null;
}

function resolveEntryOption(
  options: ScrapedApplicationFieldOption[],
  entry: ApplicationFillPlanEntry,
  field?: ScrapedApplicationField
): ScrapedApplicationFieldOption | null {
  return resolveOptionFromCandidates(options, entryStringCandidates(entry), field);
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
    case 'structured_profile':
    case 'conditional_follow_up':
      return 'missing_profile_fact: no grounded structured applicant fact is available for this field';
    case 'direct_profile':
      return 'model_uncertainty: the model did not return a grounded answer for this field';
    case 'open_ended_best_effort':
      return 'model_uncertainty: the model did not produce a grounded best-effort answer for this field';
    case 'unsupported_or_unanswerable':
      return 'model_uncertainty: the field could not be answered safely from the available context';
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
    required: isEffectivelyRequired(input.field),
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
  rawEntry?: ApplicationFillPlanEntry | undefined;
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
  rawEntry?: ApplicationFillPlanEntry | undefined;
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

function buildProfileEvidenceCorpus(serializedProfile: SerializedApplicantProfile): string {
  return normalizeTextForMatching(
    [
      serializedProfile.summary,
      serializedProfile.reusableContext,
      serializedProfile.resumeLatex.tex,
      serializedProfile.resumeContext.excerpt,
      serializedProfile.resumeContext.recentRoles.join('\n'),
      serializedProfile.resumeContext.technologies.join('\n'),
      serializedProfile.resumeContext.projectSignals.join('\n'),
      serializedProfile.resumeContext.achievementSignals.join('\n'),
      serializedProfile.resumeContext.stakeholderSignals.join('\n')
    ].join('\n')
  );
}

function hasProfessionalExperienceSupport(
  field: ScrapedApplicationField,
  serializedProfile: SerializedApplicantProfile
): boolean {
  if (!serializedProfile.resumeContext.hasProfessionalRoleSignals) {
    return false;
  }

  const corpus = buildProfileEvidenceCorpus(serializedProfile);
  const fingerprint = normalizeTextForMatching(`${field.id} ${field.label}`);

  if (includesAny(fingerprint, ['postgres', 'postgresql', 'relational database', 'database'])) {
    return (
      corpus.includes('postgres') ||
      corpus.includes('postgresql') ||
      corpus.includes('mysql') ||
      corpus.includes('database')
    );
  }

  if (includesAny(fingerprint, ['backend', 'back-end', 'production-ready backend', 'api', 'server'])) {
    return (
      corpus.includes('backend') ||
      corpus.includes('back-end') ||
      corpus.includes('api') ||
      corpus.includes('server') ||
      corpus.includes('service')
    );
  }

  return false;
}

function extractPotentialCompanyTokens(field: ScrapedApplicationField): string[] {
  const excluded = new Set([
    'HISTORY',
    'WITH',
    'CONFLICT',
    'INTEREST',
    'Have',
    'Has',
    'Ever',
    'Been',
    'Employed',
    'Company',
    'Companies',
    'Acquired',
    'Are',
    'You',
    'Your',
    'Family',
    'Relative',
    'Relationship'
  ]);

  return Array.from(field.label.matchAll(/\b[A-Z][A-Za-z0-9&.-]{2,}\b/g))
    .map((match) => match[0])
    .filter((token) => !excluded.has(token));
}

function hasCompanyRelationshipSupport(
  field: ScrapedApplicationField,
  serializedProfile: SerializedApplicantProfile,
  job: GenerateApplicationFillPlanInput['job']
): boolean {
  const corpus = buildProfileEvidenceCorpus(serializedProfile);
  const fingerprint = normalizeTextForMatching(`${field.id} ${field.label}`);
  const ignoredCompanyTerms = new Set([
    'the',
    'and',
    'inc',
    'llc',
    'ltd',
    'corp',
    'corporation',
    'company',
    'companies',
    'industries',
    'technologies',
    'systems'
  ]);
  const companyTokens = [
    ...extractPotentialCompanyTokens(field),
    ...job.companyName
      .split(/\s+/)
      .filter((token) => token.length >= 3 && !ignoredCompanyTerms.has(normalizeTextForMatching(token)))
  ];
  const hasCompanyEvidence = companyTokens.some((token) => corpus.includes(normalizeTextForMatching(token)));

  if (includesAny(fingerprint, ['conflict of interest'])) {
    return includesAny(corpus, ['conflict of interest', 'conflict with']);
  }

  if (includesAny(fingerprint, ['family member', 'relative'])) {
    return (
      hasCompanyEvidence &&
      includesAny(corpus, [
        'family member',
        'relative',
        'spouse',
        'parent',
        'sibling',
        'brother',
        'sister',
        'partner works',
        'works at'
      ])
    );
  }

  if (hasCompanyEvidence) {
    return true;
  }

  return includesAny(corpus, [
    'conflict of interest',
    'family member at',
    'relative at',
    'previously employed by',
    'formerly employed by'
  ]);
}

function resolveConsentPolicyValue(
  field: ScrapedApplicationField,
  serializedProfile: SerializedApplicantProfile
): { value: 'yes' | 'no'; source: string } {
  const fingerprint = normalizeTextForMatching(`${field.id} ${field.label}`);

  if (includesAny(fingerprint, ['record', 'recording', 'auto-transcript', 'brighthire', 'interview'])) {
    return serializedProfile.completionPolicyDefaults.consentToInterviewRecording
      ? {
          value: serializedProfile.completionPolicyDefaults.consentToInterviewRecording,
          source: 'applicantProfile.completionPolicyDefaults.consentToInterviewRecording'
        }
      : { value: 'yes', source: 'default_yes_for_required_consent' };
  }

  if (includesAny(fingerprint, ['demographic data', 'self-identification data', 'gdpr_demographic_data_consent_given'])) {
    return serializedProfile.completionPolicyDefaults.consentToDemographicDataProcessing
      ? {
          value: serializedProfile.completionPolicyDefaults.consentToDemographicDataProcessing,
          source: 'applicantProfile.completionPolicyDefaults.consentToDemographicDataProcessing'
        }
      : { value: 'yes', source: 'default_yes_for_required_consent' };
  }

  return serializedProfile.completionPolicyDefaults.acceptApplicationPrivacyNotices
    ? {
        value: serializedProfile.completionPolicyDefaults.acceptApplicationPrivacyNotices,
        source: 'applicantProfile.completionPolicyDefaults.acceptApplicationPrivacyNotices'
      }
    : { value: 'yes', source: 'default_yes_for_required_consent' };
}

function resolveSensitiveIdentificationValue(
  serializedProfile: SerializedApplicantProfile
): { value: 'yes' | 'no' | 'prefer_not_to_say'; source: string } {
  return serializedProfile.completionPolicyDefaults.lgbtqiaCommunityIdentification
    ? {
        value: serializedProfile.completionPolicyDefaults.lgbtqiaCommunityIdentification,
        source: 'applicantProfile.completionPolicyDefaults.lgbtqiaCommunityIdentification'
      }
    : { value: 'no', source: 'default_no_for_optional_sensitive_self_id' };
}

function textValueForEnum(value: 'yes' | 'no' | 'prefer_not_to_say'): string {
  switch (value) {
    case 'prefer_not_to_say':
      return 'Prefer not to say';
    case 'yes':
      return 'Yes';
    case 'no':
      return 'No';
  }
}

function isConsentOrNoticeFieldFingerprint(fingerprint: string): boolean {
  return includesAny(fingerprint, [
    'consent',
    'privacy notice',
    'privacy policy',
    'notice at collection',
    'acknowledge',
    'acknowledgement',
    'demographic data',
    'self-identification data'
  ]);
}

function pickAffirmativeConsentComboboxOption(
  options: ScrapedApplicationFieldOption[],
  policy: 'yes' | 'no'
): ScrapedApplicationFieldOption | null {
  if (options.length === 0) {
    return null;
  }

  if (policy === 'no') {
    return (
      options.find((option) => /^no$/i.test(option.label.trim())) ??
      options.find((option) => /^no$/i.test(String(option.value ?? '').trim())) ??
      null
    );
  }

  return (
    options.find((option) => /\b(?:i\s+)?acknowledge(?:ment)?\b/i.test(option.label.trim())) ??
    options.find((option) => /\bi agree\b/i.test(option.label.trim())) ??
    options.find((option) => /\bi confirm\b/i.test(option.label.trim())) ??
    options.find((option) => /^yes$/i.test(option.label.trim())) ??
    options.find((option) => /^yes$/i.test(String(option.value ?? '').trim())) ??
    (options.length === 1 ? options[0] ?? null : null)
  );
}

function resolveConsentFillTextValue(
  field: ScrapedApplicationField,
  policy: 'yes' | 'no'
): string {
  if (field.type === 'combobox' && field.options.length > 0) {
    const option = pickAffirmativeConsentComboboxOption(field.options, policy);
    if (option) {
      return option.label || option.value;
    }
  }

  return textValueForEnum(policy);
}

function resolveCompanyRelationshipFillTextValue(
  field: ScrapedApplicationField,
  supported: boolean
): string {
  const candidates = supported
    ? [
        'Yes',
        'I currently work at Robinhood as a full-time employee or intern',
        'I have previously worked at Robinhood as a full-time employee or intern (Hoodie Alumni)',
        'I currently work at Robinhood in a contractor role',
        'I have previously worked at Robinhood in a contractor role',
        'Current employee',
        'Former employee',
        'Contractor'
      ]
    : [
        'No',
        'I have never worked at Robinhood',
        'Never worked at Robinhood',
        'Never worked',
        'No prior employment'
      ];

  const optionAligned = selectorAlignedLabel(field, candidates);
  if (optionAligned) {
    return optionAligned;
  }

  return supported ? 'Yes' : 'No';
}

function createDeterministicFieldResult(input: {
  field: ScrapedApplicationField;
  answerability: PromptFieldAnswerability;
  rawEntry?: ApplicationFillPlanEntry | undefined;
  textValue: string;
  category: ApplicationFillPlanDiagnosticCategory;
  reason: string;
  recovered?: boolean;
}): { entry: ApplicationFillPlanEntry; diagnostic: ApplicationFillPlanFieldDiagnostic } {
  const { field, answerability, rawEntry, textValue, category, reason } = input;
  const confidence = rawEntry ? clampConfidence(rawEntry.confidence) || 1 : 1;
  const recovered = input.recovered ?? false;

  if (field.type === 'checkbox') {
    return createAcceptedResult({
      field,
      answerability,
      rawEntry,
      normalizedAction: 'check',
      value: normalizeForComparison(textValue) === 'yes',
      confidence,
      category,
      reason,
      recovered
    });
  }

  if (field.type === 'radio_group') {
    const optionValue = resolveOptionValue(field.options, textValue, field);
    return optionValue
      ? createAcceptedResult({
          field,
          answerability,
          rawEntry,
          normalizedAction: 'click',
          value: optionValue,
          confidence,
          category,
          reason,
          recovered
        })
      : createSkipResult({
          field,
          answerability,
          rawEntry,
          skipReason: 'normalization_rejection: deterministic response did not match a radio option',
          category: 'normalization_rejection'
        });
  }

  if (field.type === 'select') {
    const optionValue = resolveOptionValue(field.options, textValue, field);
    return optionValue
      ? createAcceptedResult({
          field,
          answerability,
          rawEntry,
          normalizedAction: 'select',
          value: optionValue,
          confidence,
          category,
          reason,
          recovered
        })
      : createSkipResult({
          field,
          answerability,
          rawEntry,
          skipReason: 'normalization_rejection: deterministic response did not match a select option',
          category: 'normalization_rejection'
        });
  }

  if (field.type === 'combobox') {
    const optionMode = field.optionMode ?? (field.options.length > 0 ? 'static' : 'dynamic_search');
    if (optionMode === 'static' && field.options.length > 0) {
      const optionValue = resolveOptionValue(field.options, textValue, field);
      const option = optionValue ? optionForResolvedValue(field.options, optionValue) : null;
      return option
        ? createAcceptedResult({
            field,
            answerability,
            rawEntry,
            normalizedAction: 'fill',
            value: option.label || option.value,
            confidence,
            category,
            reason,
            recovered
          })
        : createSkipResult({
            field,
            answerability,
            rawEntry,
            skipReason: 'normalization_rejection: deterministic response did not match a combobox option',
            category: 'normalization_rejection'
          });
    }
  }

  return createAcceptedResult({
    field,
    answerability,
    rawEntry,
    normalizedAction: 'fill',
    value: textValue,
    confidence,
    category,
    reason,
    recovered
  });
}

function jobFallbackValue(
  field: ScrapedApplicationField,
  job: GenerateApplicationFillPlanInput['job']
): string | null {
  const fingerprint = normalizeTextForMatching(`${field.id} ${field.label}`);

  if (includesAny(fingerprint, ['company name', 'name of company', 'name of the company', 'employer name'])) {
    return job.companyName || null;
  }

  if (includesAny(fingerprint, ['job title', 'position title', 'role title'])) {
    return job.title || null;
  }

  return null;
}

function identityFallbackValue(
  field: ScrapedApplicationField,
  serializedProfile: SerializedApplicantProfile
): string | null {
  const fingerprint = normalizeTextForMatching(`${field.id} ${field.label}`);

  if (includesAny(fingerprint, ['first name'])) {
    return serializedProfile.identity.fullName.split(/\s+/).filter(Boolean)[0] ?? null;
  }

  if (includesAny(fingerprint, ['last name'])) {
    const nameParts = serializedProfile.identity.fullName.split(/\s+/).filter(Boolean);
    return nameParts.length > 1 ? nameParts[nameParts.length - 1] ?? null : null;
  }

  if (includesAny(fingerprint, ['full name'])) {
    return serializedProfile.identity.fullName || null;
  }

  if (includesAny(fingerprint, ['email'])) {
    return serializedProfile.identity.email || null;
  }

  if (isPhoneCountryCodeField(fingerprint)) {
    return phoneCountryFallbackValue(field, serializedProfile);
  }

  if (includesAny(fingerprint, ['phone'])) {
    return serializedProfile.identity.phone || null;
  }

  if (includesAny(fingerprint, ['country'])) {
    return (
      countryLabelForCode(serializedProfile.workAuthorization.currentCountryCode) ??
      (serializedProfile.identity.location || null) ??
      null
    );
  }

  if (includesAny(fingerprint, ['linkedin'])) {
    return serializedProfile.identity.linkedinUrl || null;
  }

  if (includesAny(fingerprint, ['website', 'portfolio'])) {
    return serializedProfile.identity.websiteUrl || null;
  }

  if (includesAny(fingerprint, ['location', 'country'])) {
    return serializedProfile.identity.location || null;
  }

  return null;
}

function structuredFallbackValue(
  field: ScrapedApplicationField,
  serializedProfile: SerializedApplicantProfile
): string | null {
  const fingerprint = normalizeTextForMatching(`${field.id} ${field.label}`);

  if (includesAny(fingerprint, ['confirm']) && includesAny(fingerprint, ['graduation date', 'graduate', 'graduation'])) {
    return 'Yes';
  }

  if (includesAny(fingerprint, ['school', 'university', 'college'])) {
    return serializedProfile.qualifications.highestEducationSchool ?? null;
  }

  if (includesAny(fingerprint, ['degree', 'program'])) {
    return field.options.length > 0
      ? selectorAlignedLabel(field, [
          serializedProfile.qualifications.highestEducation,
          serializedProfile.qualifications.highestEducationProgram,
          serializedProfile.qualifications.highestEducationDiscipline
        ])
      : selectorAlignedLabel(field, [
          serializedProfile.qualifications.highestEducationProgram,
          serializedProfile.qualifications.highestEducation,
          serializedProfile.qualifications.highestEducationDiscipline
        ]);
  }

  if (includesAny(fingerprint, ['discipline', 'major', 'concentration'])) {
    return serializedProfile.qualifications.highestEducationDiscipline ?? null;
  }

  if (includesAny(fingerprint, ['start date year', 'start year', 'education start'])) {
    return serializedProfile.qualifications.highestEducationStartYear ?? null;
  }

  if (includesAny(fingerprint, ['end date year', 'end year', 'graduation year', 'education end'])) {
    return serializedProfile.qualifications.highestEducationEndYear ?? null;
  }

  if (includesAny(fingerprint, ['highest education', 'education level'])) {
    return serializedProfile.qualifications.highestEducation ?? null;
  }

  if (includesAny(fingerprint, ['sponsorship', 'sponsor'])) {
    return serializedProfile.workAuthorization.requiresSponsorship === true ? 'Yes' : 'No';
  }

  if (includesAny(fingerprint, ['authorized to work', 'legally authorized', 'eligible to work'])) {
    return serializedProfile.workAuthorization.legallyAuthorizedInCurrentCountry === 'no' ? 'No' : 'Yes';
  }

  if (includesAny(fingerprint, ['clearance'])) {
    return serializedProfile.workAuthorization.clearanceStatus ?? null;
  }

  if (includesAny(fingerprint, ['citizen', 'citizenship'])) {
    return serializedProfile.workAuthorization.primaryCitizenshipCountryCode ?? 'No';
  }

  if (includesAny(fingerprint, ['residence status', 'visa', 'work permit'])) {
    return (
      serializedProfile.workAuthorization.currentCountryResidenceStatusOther ??
      serializedProfile.workAuthorization.currentCountryResidenceStatus ??
      'No'
    );
  }

  if (includesAny(fingerprint, ['notice period'])) {
    return serializedProfile.workAuthorization.noticePeriod ?? 'Immediately';
  }

  if (
    includesAny(fingerprint, [
      'start date',
      'available to join',
      'available to start',
      'when are you available',
      'when can you join',
      'join date',
      'start work'
    ])
  ) {
    return serializedProfile.workAuthorization.startDate ?? 'Immediately';
  }

  if (includesAny(fingerprint, ['pronouns', 'gender'])) {
    return (
      serializedProfile.equalEmployment.genderPronounsCustom ??
      serializedProfile.equalEmployment.genderPronouns ??
      'Prefer not to say'
    );
  }

  if (includesAny(fingerprint, ['hispanic'])) {
    const raceEthnicity = normalizeTextForMatching(
      serializedProfile.equalEmployment.raceEthnicity ?? ''
    );

    if (raceEthnicity.includes('hispanic') || raceEthnicity.includes('latino')) {
      return raceEthnicity.includes('not_') || raceEthnicity.includes('non_') ? 'No' : 'Yes';
    }

    return 'Prefer not to say';
  }

  if (includesAny(fingerprint, ['race', 'ethnicity'])) {
    const raceEthnicity = serializedProfile.equalEmployment.raceEthnicity;
    return normalizeTextForMatching(raceEthnicity ?? '') === 'prefer_not_to_say'
      ? 'Prefer not to say'
      : raceEthnicity ?? 'Prefer not to say';
  }

  if (includesAny(fingerprint, ['veteran'])) {
    return serializedProfile.equalEmployment.veteranStatus ?? 'Prefer not to say';
  }

  if (includesAny(fingerprint, ['disability'])) {
    return serializedProfile.equalEmployment.disabilityStatus ?? 'Prefer not to say';
  }

  if (includesAny(fingerprint, ['criminal background'])) {
    return serializedProfile.equalEmployment.criminalBackground ?? 'No';
  }

  return null;
}

function resolveTargetCountryCode(
  promptField: PromptField,
  job: GenerateApplicationFillPlanInput['job']
): string | null {
  return promptField.targetCountryCode ?? inferCountryCodeFromText(job.location);
}

function canWorkInTargetCountry(
  field: ScrapedApplicationField,
  serializedProfile: SerializedApplicantProfile,
  targetCountryCode: string | null
): boolean | null {
  const fingerprint = normalizeTextForMatching(`${field.id} ${field.label}`);
  const workAuthorization = serializedProfile.workAuthorization;

  if (!targetCountryCode) {
    return workAuthorization.legallyAuthorizedInCurrentCountry === 'no'
      ? false
      : workAuthorization.legallyAuthorizedInCurrentCountry === 'yes'
        ? true
        : null;
  }

  if (workAuthorization.requiresSponsorshipCountryCodes.includes(targetCountryCode)) {
    return false;
  }

  if (workAuthorization.authorizedWithoutSponsorshipCountryCodes.includes(targetCountryCode)) {
    return true;
  }

  if (workAuthorization.primaryCitizenshipCountryCode === targetCountryCode) {
    return true;
  }

  if (workAuthorization.currentCountryCode !== targetCountryCode) {
    return null;
  }

  if (workAuthorization.needsSponsorshipInCurrentCountry === 'yes') {
    return false;
  }

  if (
    ['citizen', 'permanent_resident', 'open_work_permit'].includes(
      workAuthorization.currentCountryResidenceStatus ?? ''
    )
  ) {
    return true;
  }

  if (workAuthorization.currentCountryResidenceStatus === 'employer_specific_work_visa') {
    return includesAny(fingerprint, ['any employer']) ? false : true;
  }

  if (workAuthorization.legallyAuthorizedInCurrentCountry === 'yes') {
    return true;
  }

  if (workAuthorization.legallyAuthorizedInCurrentCountry === 'no') {
    return false;
  }

  return null;
}

function resolveStructuredLegalTextValue(
  field: ScrapedApplicationField,
  promptField: PromptField,
  serializedProfile: SerializedApplicantProfile,
  job: GenerateApplicationFillPlanInput['job']
): string | null {
  if (promptField.answerability !== 'structured_profile') {
    return null;
  }

  const fingerprint = normalizeTextForMatching(`${field.id} ${field.label}`);
  if (!isWorkAuthorizationPrompt(fingerprint)) {
    return null;
  }

  const targetCountryCode = resolveTargetCountryCode(promptField, job);
  const canWork = canWorkInTargetCountry(field, serializedProfile, targetCountryCode);

  if (includesAny(fingerprint, ['sponsorship', 'sponsor'])) {
    if (!promptField.targetCountryCode) {
      return null;
    }

    if (
      targetCountryCode &&
      serializedProfile.workAuthorization.requiresSponsorshipCountryCodes.includes(
        targetCountryCode
      )
    ) {
      return 'Yes';
    }

    if (targetCountryCode && canWork === true) {
      return 'No';
    }

    return serializedProfile.workAuthorization.requiresSponsorship === true ? 'Yes' : 'No';
  }

  if (
    includesAny(fingerprint, [
      'authorized to work',
      'legally authorized',
      'legally entitled to work',
      'legally eligible to work',
      'eligible to work',
      'entitled to work',
      'work for any employer'
    ])
  ) {
    return canWork === false ? 'No' : 'Yes';
  }

  return null;
}

function binaryFallbackValue(field: ScrapedApplicationField): string | null {
  const fingerprint = normalizeTextForMatching(`${field.id} ${field.label}`);
  if (isAvailabilityDateField(field)) {
    return null;
  }

  const looksBinary =
    includesAny(fingerprint, [
      'are you',
      'do you',
      'did you',
      'have you',
      'will you',
      'can you',
      'would you',
      'is your',
      'confirm'
    ]) ||
    field.options.some((option) =>
      [option.value, option.label].some((candidate) =>
        ['yes', 'no'].includes(normalizeForComparison(candidate))
      )
    );

  if (!looksBinary) {
    return null;
  }

  if (
    includesAny(fingerprint, [
      'open to',
      'willing to',
      'comfortable',
      'available to',
      'able to',
      'agree to',
      'confirm'
    ])
  ) {
    return 'Yes';
  }

  return 'No';
}

function isAvailabilityDateField(field: ScrapedApplicationField): boolean {
  const fingerprint = normalizeTextForMatching(`${field.id} ${field.label}`);
  return includesAny(fingerprint, [
    'when are you available',
    'available to join',
    'available to start',
    'when can you join',
    'start date',
    'join date'
  ]);
}

function canUseStructuredSensitiveFallback(field: ScrapedApplicationField): boolean {
  const fingerprint = normalizeTextForMatching(`${field.id} ${field.label}`);

  return includesAny(fingerprint, [
    'pronouns',
    'gender',
    'race',
    'ethnicity',
    'hispanic'
  ]);
}

function tryStructuredSensitiveFallbackResult(input: {
  field: ScrapedApplicationField;
  promptField: PromptField;
  serializedProfile: SerializedApplicantProfile;
  rawEntry?: ApplicationFillPlanEntry | undefined;
  reason: string;
}): { entry: ApplicationFillPlanEntry; diagnostic: ApplicationFillPlanFieldDiagnostic } | null {
  if (input.promptField.answerability !== 'structured_profile') {
    return null;
  }

  if (!canUseStructuredSensitiveFallback(input.field)) {
    return null;
  }

  const textValue = structuredFallbackValue(input.field, input.serializedProfile);
  if (!textValue || textValue.trim().length === 0) {
    return null;
  }

  return createDeterministicFieldResult({
    field: input.field,
    answerability: input.promptField.answerability,
    rawEntry: input.rawEntry,
    textValue,
    category: 'profile_default_sensitive_response',
    reason: input.reason,
    recovered: true
  });
}

function tryDirectProfileFallbackResult(input: {
  field: ScrapedApplicationField;
  promptField: PromptField;
  serializedProfile: SerializedApplicantProfile;
  rawEntry?: ApplicationFillPlanEntry | undefined;
  reason: string;
}): { entry: ApplicationFillPlanEntry; diagnostic: ApplicationFillPlanFieldDiagnostic } | null {
  if (input.promptField.answerability !== 'direct_profile') {
    return null;
  }

  const textValue = identityFallbackValue(input.field, input.serializedProfile);
  if (!textValue || textValue.trim().length === 0) {
    return null;
  }

  return createDeterministicFieldResult({
    field: input.field,
    answerability: input.promptField.answerability,
    rawEntry: input.rawEntry,
    textValue,
    category: 'accepted',
    reason: input.reason,
    recovered: true
  });
}

function openEndedFallbackValue(
  promptField: PromptField,
  serializedProfile: SerializedApplicantProfile
): string {
  if (promptField.intent === 'heard_about_company') {
    return 'LinkedIn';
  }

  return (
    serializedProfile.reusableContext ||
    serializedProfile.summary ||
    serializedProfile.resumeContext.excerpt ||
    'N/A'
  );
}

function requiredBestEffortTextValue(
  field: ScrapedApplicationField,
  promptField: PromptField,
  serializedProfile: SerializedApplicantProfile,
  job: GenerateApplicationFillPlanInput['job']
): string {
  return (
    jobFallbackValue(field, job) ??
    identityFallbackValue(field, serializedProfile) ??
    structuredFallbackValue(field, serializedProfile) ??
    (promptField.answerability === 'open_ended_best_effort'
      ? openEndedFallbackValue(promptField, serializedProfile)
      : null) ??
    binaryFallbackValue(field) ??
    'N/A'
  );
}

function createRequiredBestEffortResult(input: {
  field: ScrapedApplicationField;
  promptField: PromptField;
  serializedProfile: SerializedApplicantProfile;
  job: GenerateApplicationFillPlanInput['job'];
  rawEntry?: ApplicationFillPlanEntry | undefined;
  reason: string;
}): { entry: ApplicationFillPlanEntry; diagnostic: ApplicationFillPlanFieldDiagnostic } {
  const textValue = requiredBestEffortTextValue(
    input.field,
    input.promptField,
    input.serializedProfile,
    input.job
  );
  const fieldFingerprint = normalizeTextForMatching(`${input.field.id} ${input.field.label}`);
  const shouldRemainMissingStructuredFact =
    input.promptField.answerability === 'structured_profile' &&
    (textValue === 'N/A' || includesAny(fieldFingerprint, ['clearance', 'export control']));

  if (shouldRemainMissingStructuredFact) {
    return createSkipResult({
      field: input.field,
      answerability: input.promptField.answerability,
      rawEntry: input.rawEntry,
      skipReason: defaultSkipReasonForAnswerability(input.promptField.answerability),
      category: skipCategoryForAnswerability(input.promptField.answerability)
    });
  }

  return createDeterministicFieldResult({
    field: input.field,
    answerability: input.promptField.answerability,
    rawEntry: input.rawEntry,
    textValue,
    category: 'required_best_effort_default',
    reason: input.reason,
    recovered: true
  });
}

function normalizeEntryForField(
  field: ScrapedApplicationField,
  promptField: PromptField,
  serializedProfile: SerializedApplicantProfile,
  job: GenerateApplicationFillPlanInput['job'],
  entry: ApplicationFillPlanEntry | undefined
): { entry: ApplicationFillPlanEntry; diagnostic: ApplicationFillPlanFieldDiagnostic } {
  const answerability = promptField.answerability;

  if (promptField.intent === 'professional_experience_yes_no') {
    const supported = hasProfessionalExperienceSupport(field, serializedProfile);
    return createDeterministicFieldResult({
      field,
      answerability,
      rawEntry: entry,
      textValue: supported ? 'Yes' : 'No',
      category: supported ? 'accepted' : 'best_effort_negative_inference',
      reason: supported
        ? 'accepted: professional experience is supported by resume/profile context'
        : 'best_effort_negative_inference: no clear professional evidence was found in resume/profile context'
    });
  }

  if (promptField.intent === 'company_relationship_yes_no') {
    const supported = hasCompanyRelationshipSupport(field, serializedProfile, job);
    return createDeterministicFieldResult({
      field,
      answerability,
      rawEntry: entry,
      textValue: resolveCompanyRelationshipFillTextValue(field, supported),
      category: supported ? 'accepted' : 'best_effort_negative_inference',
      reason: supported
        ? 'accepted: company relationship evidence is explicitly supported by resume/profile context'
        : 'best_effort_negative_inference: no explicit company relationship, employment history, family relationship, or conflict evidence was found in resume/profile context'
    });
  }

  if (promptField.intent === 'consent_or_notice') {
    const consentResolution = resolveConsentPolicyValue(field, serializedProfile);
    return createDeterministicFieldResult({
      field,
      answerability,
      rawEntry: entry,
      textValue: resolveConsentFillTextValue(field, consentResolution.value),
      category: 'policy_default_consent',
      reason: `policy_default_consent: used ${consentResolution.source}`
    });
  }

  if (promptField.intent === 'lgbtqia_identification') {
    const sensitiveResolution = resolveSensitiveIdentificationValue(serializedProfile);
    return createDeterministicFieldResult({
      field,
      answerability,
      rawEntry: entry,
      textValue: textValueForEnum(sensitiveResolution.value),
      category: 'profile_default_sensitive_response',
      reason: `profile_default_sensitive_response: used ${sensitiveResolution.source}`
    });
  }

  const structuredLegalValue = resolveStructuredLegalTextValue(
    field,
    promptField,
    serializedProfile,
    job
  );
  if (structuredLegalValue) {
    return createDeterministicFieldResult({
      field,
      answerability,
      rawEntry: entry,
      textValue: structuredLegalValue,
      category: 'accepted',
      reason:
        'accepted: legal work authorization resolved from structured country, citizenship, and sponsorship facts',
      recovered: Boolean(entry)
    });
  }

  if (!entry) {
    const directProfileFallback = tryDirectProfileFallbackResult({
      field,
      promptField,
      serializedProfile,
      reason: 'accepted: direct profile field defaulted from applicant profile facts'
    });
    if (directProfileFallback) {
      return directProfileFallback;
    }

    const structuredSensitiveFallback = tryStructuredSensitiveFallbackResult({
      field,
      promptField,
      serializedProfile,
      reason:
        'profile_default_sensitive_response: optional structured demographic field defaulted from applicant profile'
    });
    if (structuredSensitiveFallback) {
      return structuredSensitiveFallback;
    }

    if (isRequiredNonFileField(field)) {
      return createRequiredBestEffortResult({
        field,
        promptField,
        serializedProfile,
        job,
        reason: 'required_best_effort_default: required non-file field had no model output and was recovered with the best available default'
      });
    }

    return createSkipResult({
      field,
      answerability,
      skipReason: defaultSkipReasonForAnswerability(answerability),
      category: skipCategoryForAnswerability(answerability)
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
    const directProfileFallback = tryDirectProfileFallbackResult({
      field,
      promptField,
      serializedProfile,
      rawEntry: entry,
      reason: 'accepted: provider skip recovered from applicant profile facts'
    });
    if (directProfileFallback) {
      return directProfileFallback;
    }

    const structuredSensitiveFallback = tryStructuredSensitiveFallbackResult({
      field,
      promptField,
      serializedProfile,
      rawEntry: entry,
      reason:
        'profile_default_sensitive_response: provider skip recovered with applicant profile demographic defaults'
    });
    if (structuredSensitiveFallback) {
      return structuredSensitiveFallback;
    }

    if (isRequiredNonFileField(field)) {
      return createRequiredBestEffortResult({
        field,
        promptField,
        serializedProfile,
        job,
        rawEntry: entry,
        reason: 'required_best_effort_default: required non-file field provider skip was recovered with the best available default'
      });
    }

    return createSkipResult({
      field,
      answerability,
      rawEntry: entry,
      skipReason: entry.skipReason || defaultSkipReasonForAnswerability(answerability),
      category: skipCategoryForAnswerability(answerability)
    });
  }

  if (field.type === 'combobox') {
    if (entry.action === 'fill') {
      const textValue = firstEntryString(entry) ?? '';
      if (textValue.length === 0) {
        const directProfileFallback = tryDirectProfileFallbackResult({
          field,
          promptField,
          serializedProfile,
          rawEntry: entry,
          reason: 'accepted: empty combobox response recovered from applicant profile facts'
        });
        if (directProfileFallback) {
          return directProfileFallback;
          }
      }

      const optionMode = field.optionMode ?? (field.options.length > 0 ? 'static' : 'dynamic_search');
      if (optionMode === 'static' && field.options.length > 0 && textValue.length > 0) {
        const option = resolveEntryOption(field.options, entry, field);
        if (option) {
          return createAcceptedResult({
            field,
            answerability,
            rawEntry: entry,
            normalizedAction: 'fill',
            value: option.label || option.value,
            confidence: entry.confidence
          });
        }

        if (isRequiredNonFileField(field)) {
          return createSkipResult({
            field,
            answerability,
            rawEntry: entry,
            skipReason:
              'normalization_rejection: required static combobox model option did not exactly match an available option',
            category: 'normalization_rejection'
          });
        }

        return createSkipResult({
          field,
          answerability,
          rawEntry: entry,
          skipReason: 'normalization_rejection: the model selected a combobox option that does not exist',
          category: 'normalization_rejection'
        });
      }

      // For direct_profile dynamic comboboxes (e.g. country code dropdowns), always
      // resolve the value deterministically from the profile instead of trusting the
      // LLM's text. The LLM tends to copy the raw ISO code ("CA") from the profile
      // rather than the full country name ("Canada") that the combobox actually needs.
      if (optionMode === 'dynamic_search' && answerability === 'direct_profile') {
        const profileValue = identityFallbackValue(field, serializedProfile);
        if (profileValue) {
          return createAcceptedResult({
            field,
            answerability,
            rawEntry: entry,
            normalizedAction: 'fill',
            value: profileValue,
            confidence: 1
          });
        }
      }

      return textValue.length > 0
        ? createAcceptedResult({
            field,
            answerability,
            rawEntry: entry,
            normalizedAction: 'fill',
            value: textValue,
            confidence: entry.confidence
          })
        : isRequiredNonFileField(field)
          ? createRequiredBestEffortResult({
              field,
              promptField,
              serializedProfile,
              job,
              rawEntry: entry,
              reason:
                'required_best_effort_default: required non-file field had an empty fill value and was recovered with the best available default'
            })
          :
              (tryStructuredSensitiveFallbackResult({
                field,
                promptField,
                serializedProfile,
                rawEntry: entry,
                reason:
                  'profile_default_sensitive_response: empty model value recovered with applicant profile demographic defaults'
              }) ??
                createSkipResult({
                  field,
                  answerability,
                  rawEntry: entry,
                  skipReason: 'normalization_rejection: the model returned an empty fill value',
                  category: 'normalization_rejection'
                }));
    }

    if (entry.action === 'select' || entry.action === 'click') {
      const textValue = firstEntryString(entry) ?? '';
      const optionMode = field.optionMode ?? (field.options.length > 0 ? 'static' : 'dynamic_search');
      if (optionMode === 'static' && field.options.length > 0 && textValue.length > 0) {
        const option = resolveEntryOption(field.options, entry, field);
        if (option) {
          return createAcceptedResult({
            field,
            answerability,
            rawEntry: entry,
            normalizedAction: 'fill',
            value: option.label || option.value,
            confidence: entry.confidence,
            category: 'schema_mismatch',
            reason:
              entry.action === 'click'
                ? 'schema_mismatch: combobox click action normalized to exact static combobox option'
                : 'schema_mismatch: combobox select action normalized to exact static combobox option'
          });
        }

        if (isRequiredNonFileField(field)) {
          return createSkipResult({
            field,
            answerability,
            rawEntry: entry,
            skipReason:
              'normalization_rejection: required static combobox model option did not exactly match an available option',
            category: 'normalization_rejection'
          });
        }

        return createSkipResult({
          field,
          answerability,
          rawEntry: entry,
          skipReason: 'normalization_rejection: the model selected a combobox option that does not exist',
          category: 'normalization_rejection'
        });
      }

      return textValue.length > 0
        ? createAcceptedResult({
            field,
            answerability,
            rawEntry: entry,
            normalizedAction: 'fill',
            value: textValue,
            confidence: entry.confidence,
            category: 'schema_mismatch',
            reason:
              entry.action === 'click'
                ? 'schema_mismatch: combobox fields require action "fill"; recovered from model action "click"'
                : 'schema_mismatch: combobox fields require action "fill"; recovered from model action "select"',
            recovered: true
          })
        : createSkipResult({
            field,
            answerability,
            rawEntry: entry,
            skipReason: defaultSkipReasonForAnswerability(answerability),
            category: skipCategoryForAnswerability(answerability)
          });
    }

    if (isRequiredNonFileField(field)) {
      return createRequiredBestEffortResult({
        field,
        promptField,
        serializedProfile,
        job,
        rawEntry: entry,
        reason:
          'required_best_effort_default: required non-file field had an invalid combobox action/value and was recovered with the best available default'
      });
    }

    const structuredSensitiveFallback = tryStructuredSensitiveFallbackResult({
      field,
      promptField,
      serializedProfile,
      rawEntry: entry,
      reason:
        'profile_default_sensitive_response: invalid combobox response recovered with applicant profile demographic defaults'
    });
    if (structuredSensitiveFallback) {
      return structuredSensitiveFallback;
    }

    return createSkipResult({
      field,
      answerability,
      rawEntry: entry,
      skipReason: `schema_mismatch: expected ${expectedActionsForField(field).join('/')} for ${field.type}, got ${entry.action}`,
      category: 'schema_mismatch'
    });
  }

  if (field.type === 'select') {
    const textValue = firstEntryString(entry);
    if (entry.action !== 'select' || !textValue) {
      return createSkipResult({
        field,
        answerability,
        rawEntry: entry,
        skipReason: `schema_mismatch: expected select for ${field.type}, got ${entry.action}`,
        category: 'schema_mismatch'
      });
    }

    const option = resolveEntryOption(field.options, entry, field);
    return option
      ? createAcceptedResult({
          field,
          answerability,
          rawEntry: entry,
          normalizedAction: 'select',
          value: option.value,
          confidence: entry.confidence
        })
      : isRequiredNonFileField(field)
        ? createSkipResult({
            field,
            answerability,
            rawEntry: entry,
            skipReason:
              'normalization_rejection: required select model option did not exactly match an available option',
            category: 'normalization_rejection'
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
    let radioEntry = entry;
    if (
      radioEntry &&
      radioEntry.action === 'fill' &&
      typeof radioEntry.value === 'string' &&
      radioEntry.value.trim().length > 0
    ) {
      radioEntry = { ...radioEntry, action: 'click' };
    }

    const textValue = radioEntry ? firstEntryString(radioEntry) : '';
    if (!radioEntry || radioEntry.action !== 'click' || !textValue) {
      return createSkipResult({
        field,
        answerability,
        rawEntry: entry,
        skipReason: `schema_mismatch: expected click for ${field.type}, got ${entry?.action ?? 'undefined'}`,
        category: 'schema_mismatch'
      });
    }

    const option = resolveEntryOption(field.options, radioEntry, field);
    return option
        ? createAcceptedResult({
          field,
          answerability,
          rawEntry: entry,
          normalizedAction: 'click',
          value: option.value,
          confidence: radioEntry.confidence
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
    let effectiveEntry = entry;
    if (
      effectiveEntry &&
      effectiveEntry.action === 'fill' &&
      (typeof effectiveEntry.value === 'string' ||
        Array.isArray(effectiveEntry.value) ||
        typeof effectiveEntry.value === 'boolean')
    ) {
      effectiveEntry = { ...effectiveEntry, action: 'check' };
    }

    if (!effectiveEntry || effectiveEntry.action !== 'check') {
      return createSkipResult({
        field,
        answerability,
        rawEntry: entry,
        skipReason: `schema_mismatch: expected check for ${field.type}, got ${entry?.action ?? 'undefined'}`,
        category: 'schema_mismatch'
      });
    }

    const rawValues =
      typeof effectiveEntry.value === 'string'
        ? [effectiveEntry.value]
        : Array.isArray(effectiveEntry.value)
          ? effectiveEntry.value
          : typeof effectiveEntry.value === 'boolean'
            ? [`${effectiveEntry.value}`]
            : [];
    const values = Array.from(
      new Set(
        rawValues
          .map((value) => resolveOptionValue(field.options, value, field))
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
          confidence: effectiveEntry.confidence
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
    let checkboxEntry = entry;
    if (checkboxEntry?.action === 'fill') {
      const coercedBool = coerceCheckboxValue(checkboxEntry.value);
      if (coercedBool !== null) {
        checkboxEntry = { ...checkboxEntry, action: 'check', value: coercedBool };
      }
    }

    if (!checkboxEntry || checkboxEntry.action !== 'check') {
      return createSkipResult({
        field,
        answerability,
        rawEntry: entry,
        skipReason: `schema_mismatch: expected check for ${field.type}, got ${entry?.action ?? 'undefined'}`,
        category: 'schema_mismatch'
      });
    }

    const booleanValue = coerceCheckboxValue(checkboxEntry.value);
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
          confidence: checkboxEntry.confidence
        });
  }

  if (entry.action !== 'fill' || typeof entry.value !== 'string') {
    const directProfileFallback = tryDirectProfileFallbackResult({
      field,
      promptField,
      serializedProfile,
      rawEntry: entry,
      reason: 'accepted: invalid model payload recovered from applicant profile facts'
    });
    if (directProfileFallback) {
      return directProfileFallback;
    }

    if (isRequiredNonFileField(field)) {
      return createRequiredBestEffortResult({
        field,
        promptField,
        serializedProfile,
        job,
        rawEntry: entry,
        reason:
          'required_best_effort_default: required non-file field had an invalid fill payload and was recovered with the best available default'
      });
    }

    const structuredSensitiveFallback = tryStructuredSensitiveFallbackResult({
      field,
      promptField,
      serializedProfile,
      rawEntry: entry,
      reason:
        'profile_default_sensitive_response: invalid fill payload recovered with applicant profile demographic defaults'
    });
    if (structuredSensitiveFallback) {
      return structuredSensitiveFallback;
    }

    return createSkipResult({
      field,
      answerability,
      rawEntry: entry,
      skipReason: `schema_mismatch: expected fill for ${field.type}, got ${entry.action}`,
      category: 'schema_mismatch'
    });
  }

  const textValue = entry.value.trim();
  if (
    textValue.length > 0 &&
    ['yes', 'no'].includes(normalizeForComparison(textValue)) &&
    isAvailabilityDateField(field)
  ) {
    return createRequiredBestEffortResult({
      field,
      promptField,
      serializedProfile,
      job,
      rawEntry: entry,
      reason:
        'required_best_effort_default: date availability field had yes/no answer and was recovered from profile start date'
    });
  }

  return textValue.length > 0
    ? createAcceptedResult({
        field,
        answerability,
        rawEntry: entry,
        normalizedAction: 'fill',
        value: textValue,
        confidence: entry.confidence,
        category:
          promptField.intent === 'achievement_narrative' ||
          promptField.intent === 'stakeholder_collaboration_example' ||
          promptField.intent === 'technical_experience_narrative'
            ? 'resume_grounded_best_effort'
            : 'accepted',
        reason:
          promptField.intent === 'achievement_narrative' ||
          promptField.intent === 'stakeholder_collaboration_example' ||
          promptField.intent === 'technical_experience_narrative'
            ? 'resume_grounded_best_effort: grounded experience answer accepted'
            : 'accepted'
      })
    : isRequiredNonFileField(field)
      ? createRequiredBestEffortResult({
          field,
          promptField,
          serializedProfile,
          job,
          rawEntry: entry,
          reason:
            'required_best_effort_default: required non-file field had an empty fill value and was recovered with the best available default'
        })
      :
          (tryStructuredSensitiveFallbackResult({
            field,
            promptField,
            serializedProfile,
            rawEntry: entry,
            reason:
              'profile_default_sensitive_response: empty model value recovered with applicant profile demographic defaults'
          }) ??
            createSkipResult({
              field,
              answerability,
              rawEntry: entry,
              skipReason: 'normalization_rejection: the model returned an empty fill value',
              category: 'normalization_rejection'
            }));
}

function normalizeFillPlan(
  fields: ScrapedApplicationField[],
  promptFields: PromptField[],
  serializedProfile: SerializedApplicantProfile,
  job: GenerateApplicationFillPlanInput['job'],
  items: ApplicationFillPlanEntry[]
): {
  fillPlan: ApplicationFillPlanEntry[];
  fieldDiagnostics: ApplicationFillPlanFieldDiagnostic[];
} {
  const firstEntryByFieldId = new Map<string, ApplicationFillPlanEntry>();
  const promptFieldById = new Map(promptFields.map((field) => [field.id, field]));

  for (const item of items) {
    if (!firstEntryByFieldId.has(item.fieldId)) {
      firstEntryByFieldId.set(item.fieldId, item);
    }
  }

  const normalized = fields.map((field) =>
    normalizeEntryForField(
      field,
      promptFieldById.get(field.id) ?? toPromptField(field),
      serializedProfile,
      job,
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

  const requestStructuredObjectWithRetries = async (inputRequest: {
    request: GenerateStructuredObjectInput;
    phase: 'initial' | 'repair';
    repairAttempt?: number;
  }): Promise<GenerateStructuredObjectResult> => {
    for (let retryAttempt = 0; ; retryAttempt += 1) {
      try {
        if (provider.generateStructuredObjectWithMetadata !== undefined) {
          return await provider.generateStructuredObjectWithMetadata(inputRequest.request);
        }

        return {
          object: await provider.generateStructuredObject(inputRequest.request),
          rawText: ''
        };
      } catch (error) {
        const retryableInvalidJson =
          error instanceof Error &&
          error.message.includes('OpenRouter returned invalid JSON.') &&
          retryAttempt < MAX_STAGE4_INVALID_JSON_RETRIES;

        if (!retryableInvalidJson) {
          throw error;
        }

        logStage4('provider_retry', {
          promptVersion: STAGE_4_PROMPT_VERSION,
          phase: inputRequest.phase,
          retryAttempt: retryAttempt + 1,
          repairAttempt: inputRequest.repairAttempt ?? null,
          reason: 'invalid_json_response'
        });
      }
    }
  };

  try {
    const response = await requestStructuredObjectWithRetries({
      request,
      phase: 'initial'
    });

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

    let responseJson = parsed.data;
    let normalizedResult = normalizeFillPlan(
      input.fields,
      promptPayload.fields,
      serializedProfile,
      input.job,
      responseJson.items
    );
    let fillPlanValidation = validateRequiredFillPlan({
      fields: input.fields,
      fillPlan: normalizedResult.fillPlan,
      ...(input.artifacts !== undefined ? { artifacts: input.artifacts } : {})
    });
    let repairPromptPayload: ApplicationFillPlanRepairPromptPayload | null = null;
    let repairResponseJson: z.infer<typeof applicationFillPlanResponseSchema> | null = null;
    let repairRawResponseLength = 0;

    const repairItems: ApplicationFillPlanEntry[] = [];
    for (
      let repairAttempt = 1;
      repairAttempt <= MAX_STAGE4_REPAIR_ATTEMPTS && !fillPlanValidation.ok;
      repairAttempt += 1
    ) {
      const repairFieldIds = new Set(
        fillPlanValidation.missingRequiredFields.map((field) => field.fieldId)
      );
      const currentRepairPromptPayload = buildRepairPromptPayload({
        promptPayload,
        missingRequiredFields: fillPlanValidation.missingRequiredFields,
        originalItems: normalizedResult.fillPlan
      });
      repairPromptPayload = currentRepairPromptPayload;

      const rejectionReasonByField = Object.fromEntries(
        fillPlanValidation.missingRequiredFields.map((field) => [field.fieldId, field.reason])
      );

      logStage4('repair_request_prepared', {
        promptVersion: STAGE_4_PROMPT_VERSION,
        repairAttempt,
        missingRequiredFieldIds: fillPlanValidation.missingRequiredFields.map((field) => field.fieldId),
        rejectionReasonByField
      });

      const repairRequest = {
        schemaName: 'application_fill_plan_repair',
        schema: applicationFillPlanJsonSchema as unknown as Record<string, unknown>,
        systemPrompt: buildRepairSystemPrompt(),
        prompt: JSON.stringify(currentRepairPromptPayload, null, 2)
      } satisfies GenerateStructuredObjectInput;

      const repairResponse = await requestStructuredObjectWithRetries({
        request: repairRequest,
        phase: 'repair',
        repairAttempt
      });
      repairRawResponseLength += repairResponse.rawText.length;
      const repairParsed = applicationFillPlanResponseSchema.safeParse(repairResponse.object);
      if (!repairParsed.success) {
        logStage4('repair_response_parsed', {
          promptVersion: STAGE_4_PROMPT_VERSION,
          repairAttempt,
          rawResponseLength: repairResponse.rawText.length,
          parseStatus: 'invalid',
          issues: repairParsed.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message
          }))
        });

        throw new ApplicationAnswerGenerationError(
          'invalid_output',
          'OpenRouter returned invalid structured output for the application fill-plan repair.'
        );
      }

      const repairItemsForMissingFields = repairParsed.data.items.filter((item) =>
        repairFieldIds.has(item.fieldId)
      );
      repairItems.push(...repairItemsForMissingFields);
      responseJson = {
        items: mergeFillPlanItems(responseJson.items, repairItemsForMissingFields)
      };
      normalizedResult = normalizeFillPlan(
        input.fields,
        promptPayload.fields,
        serializedProfile,
        input.job,
        responseJson.items
      );

      const currentValidation = validateRequiredFillPlan({
        fields: input.fields,
        fillPlan: normalizedResult.fillPlan,
        ...(input.artifacts !== undefined ? { artifacts: input.artifacts } : {})
      });

      logStage4('repair_response_parsed', {
        promptVersion: STAGE_4_PROMPT_VERSION,
        repairAttempt,
        rawResponseLength: repairResponse.rawText.length,
        parseStatus: 'parsed',
        remainingMissingRequiredFieldIds: currentValidation.missingRequiredFields.map(
          (field) => field.fieldId
        )
      });
      fillPlanValidation = currentValidation;
    }
    repairResponseJson = repairItems.length > 0 ? { items: repairItems } : null;

    for (
      let syntheticPass = 0;
      syntheticPass < MAX_SYNTHETIC_CHOICE_FALLBACK_PASSES && !fillPlanValidation.ok;
      syntheticPass += 1
    ) {
      const syntheticItems = buildSyntheticEntriesForMissingRequiredChoices({
        fields: input.fields,
        missing: fillPlanValidation.missingRequiredFields
      });
      if (syntheticItems.length === 0) {
        break;
      }

      logStage4('synthetic_required_choice_fallback', {
        promptVersion: STAGE_4_PROMPT_VERSION,
        pass: syntheticPass,
        fieldIds: syntheticItems.map((item) => item.fieldId)
      });

      responseJson = {
        items: mergeFillPlanItems(responseJson.items, syntheticItems)
      };
      normalizedResult = normalizeFillPlan(
        input.fields,
        promptPayload.fields,
        serializedProfile,
        input.job,
        responseJson.items
      );
      fillPlanValidation = validateRequiredFillPlan({
        fields: input.fields,
        fillPlan: normalizedResult.fillPlan,
        ...(input.artifacts !== undefined ? { artifacts: input.artifacts } : {})
      });
    }

    const { fillPlan, fieldDiagnostics } = normalizedResult;
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
      diagnosticCategoryCounts,
      missingRequiredFieldIds: fillPlanValidation.missingRequiredFields.map((field) => field.fieldId)
    });

    return {
      promptVersion: STAGE_4_PROMPT_VERSION,
      rawResponseLength: response.rawText.length,
      serializedProfileShape,
      promptPayload,
      repairPromptPayload,
      responseJson,
      repairResponseJson,
      fieldDiagnostics,
      fillPlanValidation,
      repairRawResponseLength,
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
