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

  test('coerces greenhouse combobox select responses into fill actions with explicit diagnostics', async () => {
    const provider = createProvider({
      items: [
        {
          fieldId: 'country',
          action: 'fill',
          value: 'Canada',
          confidence: 1,
          skipReason: ''
        },
        {
          fieldId: 'sponsorship',
          action: 'select',
          value: 'Yes',
          confidence: 0.92,
          skipReason: ''
        },
        {
          fieldId: 'clearance',
          action: 'select',
          value: null,
          confidence: 0,
          skipReason: 'ambiguous or unsupported field'
        }
      ]
    });

    const result = await generateApplicationFillPlan({
      applicantProfile: baseApplicant({
        autofillProfile: minimalAutofillProfileSchema.parse({
          workAuthorizationCountriesCsv: 'CA',
          requiresSponsorship: 'yes'
        })
      }),
      job: baseJob(),
      fields: [
        {
          id: 'country',
          label: 'Country*',
          type: 'combobox',
          required: true,
          visible: true,
          enabled: true,
          selectorCandidates: ['#country'],
          options: []
        },
        {
          id: 'sponsorship',
          label: 'Will you require sponsorship from Anduril for employment now or in the future (e.g, H1B visa)?*',
          type: 'combobox',
          required: true,
          visible: true,
          enabled: true,
          selectorCandidates: ['#sponsorship'],
          options: []
        },
        {
          id: 'clearance',
          label:
            'CLEARANCE ELIGIBILITY - This position requires eligibility to obtain and maintain a U.S. security clearance.*',
          type: 'combobox',
          required: true,
          visible: true,
          enabled: true,
          selectorCandidates: ['#clearance'],
          options: []
        }
      ],
      provider
    });

    expect(result.fillPlan).toEqual([
      {
        fieldId: 'country',
        action: 'fill',
        value: 'Canada',
        confidence: 1,
        skipReason: ''
      },
      {
        fieldId: 'sponsorship',
        action: 'fill',
        value: 'Yes',
        confidence: 0.92,
        skipReason: ''
      },
      {
        fieldId: 'clearance',
        action: 'skip',
        value: null,
        confidence: 0,
        skipReason: 'missing_profile_fact: no grounded applicant profile fact is available for this field'
      }
    ]);

    expect(result.fieldDiagnostics).toEqual([
      expect.objectContaining({
        fieldId: 'country',
        answerability: 'direct_profile',
        category: 'accepted',
        rawAction: 'fill',
        normalizedAction: 'fill'
      }),
      expect.objectContaining({
        fieldId: 'sponsorship',
        answerability: 'structured_profile',
        category: 'schema_mismatch',
        rawAction: 'select',
        normalizedAction: 'fill',
        expectedActions: ['fill'],
        recovered: true
      }),
      expect.objectContaining({
        fieldId: 'clearance',
        answerability: 'company_specific_or_unsupported',
        category: 'missing_profile_fact',
        rawAction: 'select',
        normalizedAction: 'skip',
        recovered: false
      })
    ]);
  });

  test('includes prompt payload classifications and preserves greenhouse regression diagnostics', async () => {
    const provider = createProvider({
      items: [
        {
          fieldId: 'first_name',
          action: 'fill',
          value: 'Amro',
          confidence: 1,
          skipReason: ''
        },
        {
          fieldId: 'question_10957802007',
          action: 'select',
          value: 'Yes',
          confidence: 1,
          skipReason: ''
        },
        {
          fieldId: 'question_10957798007',
          action: 'select',
          value: null,
          confidence: 0,
          skipReason: 'ambiguous or unsupported field'
        },
        {
          fieldId: 'question_10957807007',
          action: 'fill',
          value: '',
          confidence: 0,
          skipReason: 'optional field, skip fill'
        }
      ]
    });

    const result = await generateApplicationFillPlan({
      applicantProfile: baseApplicant({
        fullName: 'Amro Moosa',
        email: 'amromousa8@gmail.com',
        phone: '+19054621004',
        autofillProfile: minimalAutofillProfileSchema.parse({
          workAuthorizationCountriesCsv: 'CA',
          requiresSponsorship: 'yes'
        })
      }),
      job: baseJob({
        companyName: 'Anduril Industries'
      }),
      fields: [
        {
          id: 'first_name',
          label: 'First Name*',
          type: 'text',
          required: true,
          visible: true,
          enabled: true,
          selectorCandidates: ['#first_name'],
          options: []
        },
        {
          id: 'question_10957798007',
          label:
            'CLEARANCE ELIGIBILITY - This position requires eligibility to obtain and maintain a U.S. security clearance.*',
          type: 'combobox',
          required: true,
          visible: true,
          enabled: true,
          selectorCandidates: ['#question_10957798007'],
          options: []
        },
        {
          id: 'question_10957802007',
          label: 'Will you require sponsorship from Anduril for employment now or in the future (e.g, H1B visa)?*',
          type: 'combobox',
          required: true,
          visible: true,
          enabled: true,
          selectorCandidates: ['#question_10957802007'],
          options: []
        },
        {
          id: 'question_10957807007',
          label: 'If other, please specify',
          type: 'text',
          required: false,
          visible: true,
          enabled: true,
          selectorCandidates: ['#question_10957807007'],
          options: []
        }
      ],
      provider
    });

    expect(result.promptPayload.fields).toEqual([
      expect.objectContaining({
        id: 'first_name',
        answerability: 'direct_profile'
      }),
      expect.objectContaining({
        id: 'question_10957798007',
        answerability: 'company_specific_or_unsupported'
      }),
      expect.objectContaining({
        id: 'question_10957802007',
        answerability: 'structured_profile'
      }),
      expect.objectContaining({
        id: 'question_10957807007',
        answerability: 'conditional_follow_up'
      })
    ]);

    expect(result.fillPlan.map((entry) => entry.skipReason)).not.toContain(
      'invalid_action_for_field_type'
    );
    expect(result.fieldDiagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fieldId: 'question_10957802007',
          category: 'schema_mismatch',
          normalizedAction: 'fill',
          recovered: true
        }),
        expect.objectContaining({
          fieldId: 'question_10957798007',
          category: 'missing_profile_fact'
        }),
        expect.objectContaining({
          fieldId: 'question_10957807007',
          category: 'normalization_rejection'
        })
      ])
    );
  });
});
