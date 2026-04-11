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
  baseResumeTex: String.raw`\section{Experience}
\textbf{Software Developer Intern}
\begin{itemize}
\item Built browser automation workflows in TypeScript and Playwright for QA and operations teams.
\item Partnered with product and operations stakeholders to replace manual review steps with internal tooling.
\end{itemize}`,
  preferredCountries: ['CA', 'US'],
  jobKeywordProfile: null,
  jobKeywordProfileGeneratedAt: null,
  autofillProfile: minimalAutofillProfileSchema.parse({
    workAuthorizationCountriesCsv: 'CA, US',
    requiresSponsorship: 'no',
    currentCountryCode: 'CA',
    primaryCitizenshipCountryCode: 'CA',
    currentCountryResidenceStatus: 'citizen',
    legallyAuthorizedInCurrentCountry: 'yes',
    needsSponsorshipInCurrentCountry: 'no',
    consentToInterviewRecording: 'yes',
    acceptApplicationPrivacyNotices: 'yes',
    consentToDemographicDataProcessing: 'yes',
    lgbtqiaCommunityIdentification: 'no',
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

  test('serializes structured legal facts and job-country context into the OpenRouter prompt', async () => {
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
    expect(request?.prompt).toContain('"currentCountryCode": "CA"');
    expect(request?.prompt).toContain('"primaryCitizenshipCountryCode": "CA"');
    expect(request?.prompt).toContain('"currentCountryResidenceStatus": "citizen"');
    expect(request?.prompt).toContain('"legallyAuthorizedInCurrentCountry": "yes"');
    expect(request?.prompt).toContain('"needsSponsorshipInCurrentCountry": "no"');
    expect(request?.prompt).toContain('"noticePeriod": "2_weeks"');
    expect(request?.prompt).toContain('"jobCountryContext"');
    expect(request?.prompt).toContain('"normalizedJobCountryCode": "CA"');
  });

  test('serializes resume-derived experience context into the OpenRouter prompt payload', async () => {
    const provider = createProvider({ items: [] });

    const result = await generateApplicationFillPlan({
      applicantProfile: baseApplicant(),
      job: baseJob(),
      fields: [
        {
          id: 'question_30320687003',
          label: 'Tell us about your proudest achievement from your last two years of work.',
          type: 'textarea',
          required: true,
          visible: true,
          enabled: true,
          selectorCandidates: ['#question_30320687003'],
          options: []
        }
      ],
      provider
    });

    expect(result.promptPayload.applicantProfile.resumeContext).toEqual(
      expect.objectContaining({
        available: true,
        technologies: expect.arrayContaining(['TypeScript', 'Playwright']),
        stakeholderSignals: expect.arrayContaining([
          'Partnered with product and operations stakeholders to replace manual review steps with internal tooling.'
        ])
      })
    );
    expect(result.promptPayload.applicantProfile.resumeLatex).toEqual(
      expect.objectContaining({
        available: true,
        fileName: 'resume.tex',
        tex: expect.stringContaining(String.raw`\section{Experience}`)
      })
    );
    expect(result.promptPayload.applicantProfile.equalEmployment.veteranStatus).toBeNull();

    const request = provider.generateStructuredObjectWithMetadata.mock.calls[0]?.[0];
    expect(request?.prompt).toContain('"resumeLatex"');
    expect(request?.prompt).toContain(String.raw`\section{Experience}`);
    expect(request?.prompt).toContain('"resumeContext"');
    expect(request?.prompt).toContain('"TypeScript"');
    expect(request?.prompt).toContain('"Playwright"');
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
        skipReason: 'missing_profile_fact: no grounded structured applicant fact is available for this field'
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
        answerability: 'structured_profile',
        category: 'missing_profile_fact',
        rawAction: 'select',
        normalizedAction: 'skip',
        recovered: false
      })
    ]);
  });

  test('classifies open-ended company questions as best-effort and preserves strict structured diagnostics', async () => {
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
          fieldId: 'question_10957801007',
          action: 'skip',
          value: null,
          confidence: 0.1,
          skipReason: 'not enough direct sourcing'
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
          id: 'question_10957801007',
          label: 'How did you hear about Anduril?',
          type: 'combobox',
          required: true,
          visible: true,
          enabled: true,
          selectorCandidates: ['#question_10957801007'],
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
        id: 'question_10957801007',
        answerability: 'open_ended_best_effort'
      }),
      expect.objectContaining({
        id: 'question_10957798007',
        answerability: 'structured_profile'
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
    expect(result.fillPlan).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fieldId: 'question_10957801007',
          action: 'skip',
          skipReason: 'not enough direct sourcing'
        })
      ])
    );
    expect(result.fieldDiagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fieldId: 'question_10957801007',
          category: 'model_uncertainty'
        }),
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

  test('classifies Remote-style open-ended and legal-country prompts with best-effort and structured buckets', async () => {
    const provider = createProvider({
      items: [
        {
          fieldId: 'heard_about_remote',
          action: 'fill',
          value: 'LinkedIn',
          confidence: 0.8,
          skipReason: ''
        },
        {
          fieldId: 'interest_remote',
          action: 'fill',
          value: 'I am interested in Remote because the role aligns with my automation and product-minded engineering experience.',
          confidence: 0.78,
          skipReason: ''
        },
        {
          fieldId: 'work_country_eligibility',
          action: 'click',
          value: 'Yes',
          confidence: 0.9,
          skipReason: ''
        }
      ]
    });

    const result = await generateApplicationFillPlan({
      applicantProfile: baseApplicant(),
      job: baseJob({
        companyName: 'Remote',
        location: 'Remote - Canada'
      }),
      fields: [
        {
          id: 'heard_about_remote',
          label: 'How did you hear about Remote?',
          type: 'text',
          required: true,
          visible: true,
          enabled: true,
          selectorCandidates: ['#heard_about_remote'],
          options: []
        },
        {
          id: 'interest_remote',
          label: 'What makes you interested in working with Remote?',
          type: 'textarea',
          required: true,
          visible: true,
          enabled: true,
          selectorCandidates: ['#interest_remote'],
          options: []
        },
        {
          id: 'work_country_eligibility',
          label: 'Are you legally eligible to work in the country where you’re planning to work from?',
          type: 'radio_group',
          required: true,
          visible: true,
          enabled: true,
          selectorCandidates: ['[name="work_country_eligibility"]'],
          options: [
            { value: 'yes', label: 'Yes' },
            { value: 'no', label: 'No' }
          ]
        }
      ],
      provider
    });

    expect(result.promptPayload.jobCountryContext).toEqual({
      jobLocationRaw: 'Remote - Canada',
      normalizedJobCountryCode: 'CA'
    });
    expect(result.promptPayload.fields).toEqual([
      expect.objectContaining({
        id: 'heard_about_remote',
        answerability: 'open_ended_best_effort'
      }),
      expect.objectContaining({
        id: 'interest_remote',
        answerability: 'open_ended_best_effort'
      }),
      expect.objectContaining({
        id: 'work_country_eligibility',
        answerability: 'structured_profile'
      })
    ]);
  });

  test('uses deterministic negative inference for unsupported professional experience prompts instead of skipping', async () => {
    const provider = createProvider({ items: [] });

    const result = await generateApplicationFillPlan({
      applicantProfile: baseApplicant({
        baseResumeTex: String.raw`\section{Experience}
\textbf{Software Developer Intern}
\begin{itemize}
\item Built browser automation workflows in TypeScript and Playwright for QA and operations teams.
\end{itemize}`
      }),
      job: baseJob({
        companyName: 'Remote',
        location: 'Remote - Canada'
      }),
      fields: [
        {
          id: 'question_30320684003',
          label:
            'Have you developed, maintained, and delivered production-ready backend code in a professional setting? *',
          type: 'combobox',
          required: true,
          visible: true,
          enabled: true,
          selectorCandidates: ['#question_30320684003'],
          options: []
        },
        {
          id: 'question_30320685003',
          label:
            'Do you have hands-on experience working with Postgres (or a similar relational database) in a professional setting?*',
          type: 'combobox',
          required: true,
          visible: true,
          enabled: true,
          selectorCandidates: ['#question_30320685003'],
          options: []
        }
      ],
      provider
    });

    expect(result.promptPayload.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'question_30320684003',
          answerability: 'open_ended_best_effort',
          intent: 'professional_experience_yes_no'
        }),
        expect.objectContaining({
          id: 'question_30320685003',
          answerability: 'open_ended_best_effort',
          intent: 'professional_experience_yes_no'
        })
      ])
    );

    expect(result.fillPlan).toEqual([
      {
        fieldId: 'question_30320684003',
        action: 'fill',
        value: 'No',
        confidence: 1,
        skipReason: ''
      },
      {
        fieldId: 'question_30320685003',
        action: 'fill',
        value: 'No',
        confidence: 1,
        skipReason: ''
      }
    ]);

    expect(result.fieldDiagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fieldId: 'question_30320684003',
          category: 'best_effort_negative_inference'
        }),
        expect.objectContaining({
          fieldId: 'question_30320685003',
          category: 'best_effort_negative_inference'
        })
      ])
    );
  });

  test('uses consent policy defaults and sensitive self-id defaults instead of skipping', async () => {
    const provider = createProvider({ items: [] });

    const result = await generateApplicationFillPlan({
      applicantProfile: baseApplicant({
        autofillProfile: minimalAutofillProfileSchema.parse({
          workAuthorizationCountriesCsv: 'CA, US',
          requiresSponsorship: 'no',
          currentCountryCode: 'CA',
          primaryCitizenshipCountryCode: 'CA',
          currentCountryResidenceStatus: 'citizen',
          legallyAuthorizedInCurrentCountry: 'yes',
          needsSponsorshipInCurrentCountry: 'no',
          consentToInterviewRecording: '',
          acceptApplicationPrivacyNotices: '',
          consentToDemographicDataProcessing: '',
          lgbtqiaCommunityIdentification: ''
        })
      }),
      job: baseJob({
        companyName: 'Remote',
        location: 'Remote - Canada'
      }),
      fields: [
        {
          id: 'question_30320690003',
          label: 'Do you consent to us using this tool during your first interview?',
          type: 'combobox',
          required: true,
          visible: true,
          enabled: true,
          selectorCandidates: ['#question_30320690003'],
          options: []
        },
        {
          id: 'question_30320692003',
          label: 'Notice at Collection for California Job Applicants *',
          type: 'combobox',
          required: true,
          visible: true,
          enabled: true,
          selectorCandidates: ['#question_30320692003'],
          options: []
        },
        {
          id: 'gdpr_demographic_data_consent_given',
          label: 'I consent to demographic data processing',
          type: 'checkbox',
          required: true,
          visible: true,
          enabled: true,
          selectorCandidates: ['#gdpr_demographic_data_consent_given'],
          options: []
        },
        {
          id: '4017903003',
          label:
            'Do you identify as a member of the lesbian, gay, bisexual, transgender, queer, intersex, or asexual community?',
          type: 'combobox',
          required: true,
          visible: true,
          enabled: true,
          selectorCandidates: ['#4017903003'],
          options: []
        },
        {
          id: '4017904003',
          label: 'Disability status',
          type: 'combobox',
          required: true,
          visible: true,
          enabled: true,
          selectorCandidates: ['#4017904003'],
          options: []
        }
      ],
      provider
    });

    expect(result.fillPlan).toEqual([
      {
        fieldId: 'question_30320690003',
        action: 'fill',
        value: 'Yes',
        confidence: 1,
        skipReason: ''
      },
      {
        fieldId: 'question_30320692003',
        action: 'fill',
        value: 'Yes',
        confidence: 1,
        skipReason: ''
      },
      {
        fieldId: 'gdpr_demographic_data_consent_given',
        action: 'check',
        value: true,
        confidence: 1,
        skipReason: ''
      },
      {
        fieldId: '4017903003',
        action: 'fill',
        value: 'No',
        confidence: 1,
        skipReason: ''
      },
      {
        fieldId: '4017904003',
        action: 'skip',
        value: null,
        confidence: 0,
        skipReason: 'missing_profile_fact: no grounded structured applicant fact is available for this field'
      }
    ]);

    expect(result.fieldDiagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fieldId: 'question_30320690003',
          category: 'policy_default_consent'
        }),
        expect.objectContaining({
          fieldId: 'question_30320692003',
          category: 'policy_default_consent'
        }),
        expect.objectContaining({
          fieldId: 'gdpr_demographic_data_consent_given',
          category: 'policy_default_consent'
        }),
        expect.objectContaining({
          fieldId: '4017903003',
          category: 'profile_default_sensitive_response'
        }),
        expect.objectContaining({
          fieldId: '4017904003',
          category: 'missing_profile_fact'
        })
      ])
    );
  });

  test('honors explicit consent and sensitive self-id profile overrides', async () => {
    const provider = createProvider({ items: [] });

    const result = await generateApplicationFillPlan({
      applicantProfile: baseApplicant({
        autofillProfile: minimalAutofillProfileSchema.parse({
          workAuthorizationCountriesCsv: 'CA, US',
          requiresSponsorship: 'no',
          currentCountryCode: 'CA',
          primaryCitizenshipCountryCode: 'CA',
          currentCountryResidenceStatus: 'citizen',
          legallyAuthorizedInCurrentCountry: 'yes',
          needsSponsorshipInCurrentCountry: 'no',
          consentToInterviewRecording: 'no',
          acceptApplicationPrivacyNotices: 'yes',
          consentToDemographicDataProcessing: 'no',
          lgbtqiaCommunityIdentification: 'prefer_not_to_say'
        })
      }),
      job: baseJob(),
      fields: [
        {
          id: 'question_30320690003',
          label: 'Do you consent to interview recording?',
          type: 'combobox',
          required: true,
          visible: true,
          enabled: true,
          selectorCandidates: ['#question_30320690003'],
          options: []
        },
        {
          id: 'gdpr_demographic_data_consent_given',
          label: 'I consent to demographic data processing',
          type: 'checkbox',
          required: true,
          visible: true,
          enabled: true,
          selectorCandidates: ['#gdpr_demographic_data_consent_given'],
          options: []
        },
        {
          id: '4017903003',
          label:
            'Do you identify as a member of the lesbian, gay, bisexual, transgender, queer, intersex, or asexual community?',
          type: 'combobox',
          required: true,
          visible: true,
          enabled: true,
          selectorCandidates: ['#4017903003'],
          options: []
        }
      ],
      provider
    });

    expect(result.fillPlan).toEqual([
      {
        fieldId: 'question_30320690003',
        action: 'fill',
        value: 'No',
        confidence: 1,
        skipReason: ''
      },
      {
        fieldId: 'gdpr_demographic_data_consent_given',
        action: 'check',
        value: false,
        confidence: 1,
        skipReason: ''
      },
      {
        fieldId: '4017903003',
        action: 'fill',
        value: 'Prefer not to say',
        confidence: 1,
        skipReason: ''
      }
    ]);
  });
});
