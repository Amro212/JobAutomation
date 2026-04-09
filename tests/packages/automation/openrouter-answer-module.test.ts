import { describe, expect, test, vi } from 'vitest';

import type { ApplicantProfile } from '../../../packages/core/src/applicant-profile';
import { minimalAutofillProfileSchema } from '../../../packages/core/src/autofill-profile';
import type { JobRecord } from '../../../packages/core/src/job';
import type { ScrapedApplicationField } from '../../../packages/automation/src/apply/form-scraper';
import {
  generateApplicationFillPlan,
  type ApplicationAnswerProvider
} from '../../../packages/automation/src/apply/openrouter-answer-module';

const baseApplicant = (overrides: Partial<ApplicantProfile> = {}): ApplicantProfile => ({
  id: 'default',
  fullName: 'Taylor Example',
  email: 'taylor@example.com',
  phone: '555-0100',
  location: 'Toronto, ON',
  summary: 'TypeScript engineer focused on browser automation.',
  reusableContext: 'Authorized to work in Canada and the United States without sponsorship.',
  linkedinUrl: 'https://www.linkedin.com/in/taylor-example',
  websiteUrl: 'https://example.com',
  baseResumeFileName: 'resume.tex',
  baseResumeTex: '\\section{Experience}',
  preferredCountries: ['CA', 'US'],
  jobKeywordProfile: null,
  jobKeywordProfileGeneratedAt: null,
  autofillProfile: minimalAutofillProfileSchema.parse({
    workAuthorizationCountriesCsv: 'CA, US',
    requiresSponsorship: 'no',
    noticePeriod: '2_weeks',
    startDate: '2026-05-01',
    relocation: 'yes',
    workPreference: 'hybrid'
  }),
  updatedAt: new Date('2026-04-09T09:00:00.000Z'),
  ...overrides
});

const baseJob = (overrides: Partial<JobRecord> = {}): JobRecord => ({
  id: 'job-1',
  sourceKind: 'greenhouse',
  sourceId: 'greenhouse-1',
  sourceUrl: 'https://job-boards.greenhouse.io/example/jobs/1',
  companyName: 'Example Corp',
  title: 'Platform Engineer',
  location: 'Toronto, ON',
  remoteType: 'hybrid',
  employmentType: 'full-time',
  compensationText: null,
  descriptionText: 'Build reliable automation systems.',
  rawPayload: null,
  discoveryRunId: null,
  status: 'shortlisted',
  reviewNotes: '',
  reviewSummary: null,
  reviewScore: null,
  reviewScoreReasoning: null,
  reviewUpdatedAt: null,
  reviewScoreUpdatedAt: null,
  discoveredAt: new Date('2026-04-09T09:00:00.000Z'),
  updatedAt: new Date('2026-04-09T09:00:00.000Z'),
  ...overrides
});

function createProvider(result: unknown): ApplicationAnswerProvider & {
  generateStructuredObjectWithMetadata: ReturnType<typeof vi.fn>;
} {
  return {
    generateStructuredObject: vi.fn(),
    generateStructuredObjectWithMetadata: vi.fn().mockResolvedValue({
      object: result,
      rawText: JSON.stringify(result)
    })
  };
}

describe('openrouter answer module', () => {
  test('normalizes provider output into a complete fill plan with safe skips', async () => {
    const fields: ScrapedApplicationField[] = [
      {
        id: 'first_name',
        label: 'First Name',
        type: 'text',
        required: true,
        visible: true,
        enabled: true,
        selectorCandidates: ['#first_name'],
        options: []
      },
      {
        id: 'country',
        label: 'Country',
        type: 'select',
        required: true,
        visible: true,
        enabled: true,
        selectorCandidates: ['#country'],
        options: [
          { value: 'ca', label: 'Canada' },
          { value: 'us', label: 'United States' }
        ]
      },
      {
        id: 'resume',
        label: 'Resume/CV',
        type: 'file',
        required: true,
        visible: true,
        enabled: true,
        selectorCandidates: ['#resume'],
        options: [],
        specialHandling: 'file_upload'
      },
      {
        id: 'work_auth',
        label: 'Are you legally authorized to work in Canada?',
        type: 'radio_group',
        required: true,
        visible: true,
        enabled: true,
        selectorCandidates: ['[name="work_auth"]'],
        options: [
          { value: 'yes', label: 'Yes' },
          { value: 'no', label: 'No' }
        ]
      }
    ];
    const provider = createProvider({
      items: [
        {
          fieldId: 'first_name',
          action: 'fill',
          value: 'Taylor',
          confidence: 0.99,
          skipReason: ''
        },
        {
          fieldId: 'country',
          action: 'select',
          value: 'Canada',
          confidence: 0.94,
          skipReason: ''
        },
        {
          fieldId: 'resume',
          action: 'fill',
          value: 'resume.pdf',
          confidence: 0.6,
          skipReason: ''
        },
        {
          fieldId: 'work_auth',
          action: 'click',
          value: 'Yes',
          confidence: 0.88,
          skipReason: ''
        },
        {
          fieldId: 'unknown_field',
          action: 'fill',
          value: 'ignore me',
          confidence: 1,
          skipReason: ''
        }
      ]
    });

    const result = await generateApplicationFillPlan({
      applicantProfile: baseApplicant(),
      job: baseJob(),
      fields,
      provider
    });

    expect(result.promptVersion).toBe('stage4-fill-plan-v1');
    expect(result.responseJson).toEqual({
      items: [
        {
          fieldId: 'first_name',
          action: 'fill',
          value: 'Taylor',
          confidence: 0.99,
          skipReason: ''
        },
        {
          fieldId: 'country',
          action: 'select',
          value: 'Canada',
          confidence: 0.94,
          skipReason: ''
        },
        {
          fieldId: 'resume',
          action: 'fill',
          value: 'resume.pdf',
          confidence: 0.6,
          skipReason: ''
        },
        {
          fieldId: 'work_auth',
          action: 'click',
          value: 'Yes',
          confidence: 0.88,
          skipReason: ''
        },
        {
          fieldId: 'unknown_field',
          action: 'fill',
          value: 'ignore me',
          confidence: 1,
          skipReason: ''
        }
      ]
    });
    expect(result.fillPlan).toEqual([
      {
        fieldId: 'first_name',
        action: 'fill',
        value: 'Taylor',
        confidence: 0.99,
        skipReason: ''
      },
      {
        fieldId: 'country',
        action: 'select',
        value: 'ca',
        confidence: 0.94,
        skipReason: ''
      },
      {
        fieldId: 'resume',
        action: 'skip',
        value: null,
        confidence: 0.6,
        skipReason: 'file_upload_handled_later'
      },
      {
        fieldId: 'work_auth',
        action: 'click',
        value: 'yes',
        confidence: 0.88,
        skipReason: ''
      }
    ]);
  });

  test('serializes work authorization facts into the OpenRouter prompt', async () => {
    const provider = createProvider({ items: [] });

    await generateApplicationFillPlan({
      applicantProfile: baseApplicant(),
      job: baseJob(),
      fields: [
        {
          id: 'work_auth',
          label: 'Will you require sponsorship now or in the future?',
          type: 'radio_group',
          required: true,
          visible: true,
          enabled: true,
          selectorCandidates: ['[name="work_auth"]'],
          options: [
            { value: 'yes', label: 'Yes' },
            { value: 'no', label: 'No' }
          ]
        }
      ],
      provider
    });

    const request = provider.generateStructuredObjectWithMetadata.mock.calls[0]?.[0];
    expect(request?.prompt).toContain('"authorizedWithoutSponsorshipCountryCodes": [');
    expect(request?.prompt).toContain('"CA"');
    expect(request?.prompt).toContain('"US"');
    expect(request?.prompt).toContain('"requiresSponsorship": false');
    expect(request?.prompt).toContain('"noticePeriod": "2_weeks"');
  });

  test('throws an invalid_output error when the provider returns malformed plan data', async () => {
    const provider = createProvider({
      items: 'not-an-array'
    });

    await expect(
      generateApplicationFillPlan({
        applicantProfile: baseApplicant(),
        job: baseJob(),
        fields: [
          {
            id: 'email',
            label: 'Email',
            type: 'email',
            required: true,
            visible: true,
            enabled: true,
            selectorCandidates: ['#email'],
            options: []
          }
        ],
        provider
      })
    ).rejects.toMatchObject({
      code: 'invalid_output'
    });
  });
});
