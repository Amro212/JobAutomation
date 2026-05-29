import { describe, expect, test } from 'vitest';

import { defaultMinimalAutofillProfile, type ApplicantProfile, type JobRecord } from '../../../packages/core/src';
import { buildTailoringInput } from '../../../packages/documents/src/tailoring/build-tailoring-input';

function createJob(overrides: Partial<JobRecord> = {}): JobRecord {
  return {
    id: 'job-1',
    sourceKind: 'greenhouse',
    sourceId: 'source-1',
    sourceUrl: 'https://job-boards.greenhouse.io/example/jobs/1',
    companyName: 'Anduril',
    title: 'Manager, Cyber Threat Intelligence',
    location: 'Remote - Canada',
    remoteType: 'remote',
    employmentType: 'full-time',
    compensationText: null,
    descriptionText: '',
    rawPayload: null,
    discoveryRunId: null,
    status: 'shortlisted',
    reviewNotes: '',
    reviewSummary: null,
    reviewScore: null,
    reviewScoreReasoning: null,
    reviewUpdatedAt: null,
    reviewScoreUpdatedAt: null,
    discoveredAt: new Date('2026-05-20T12:00:00.000Z'),
    updatedAt: new Date('2026-05-20T12:00:00.000Z'),
    prefilterPass: null,
    prefilterScore: null,
    prefilterReasonsJson: null,
    prefilterSignalsJson: null,
    ...overrides
  };
}

function createProfile(overrides: Partial<ApplicantProfile> = {}): ApplicantProfile {
  return {
    id: 'default',
    fullName: 'Taylor Example',
    email: 'taylor@example.com',
    phone: '555-0100',
    location: 'Toronto, ON',
    summary: 'Applicant-only Rust graphics specialist.',
    reusableContext: 'Applicant-only Elixir Phoenix context that should not become job keywords.',
    linkedinUrl: '',
    websiteUrl: '',
    baseResumeFileName: 'resume.tex',
    baseResumeTex: String.raw`\begin{document}\item Built TypeScript automation.\end{document}`,
    preferredCountries: [],
    jobKeywordProfile: null,
    jobKeywordProfileGeneratedAt: null,
    autofillProfile: defaultMinimalAutofillProfile,
    emailVerification: {
      enabled: false,
      provider: 'gmail_oauth',
      gmailUserEmail: '',
      gmailClientId: '',
      gmailClientSecret: '',
      gmailRefreshToken: ''
    },
    updatedAt: new Date('2026-05-20T12:00:00.000Z'),
    ...overrides
  };
}

describe('buildTailoringInput', () => {
  test('extracts role-specific keywords from clean job text without applicant-only terms', () => {
    const input = buildTailoringInput({
      job: createJob({
        descriptionText: `
          <div class="content"><strong>About the role</strong></div>
          <p>Lead cyber threat intelligence work for distributed security systems.</p>
          <p>Use Python, AWS, testing automation, and front-end dashboards.</p>
          <p>Build evaluation infrastructure for incident response.</p>
          <span>Benefits welcome everyone.</span>
        `
      }),
      applicantProfile: createProfile()
    });

    expect(input.jobKeywords).toEqual(
      expect.arrayContaining([
        'cyber',
        'threat',
        'intelligence',
        'distributed',
        'security',
        'testing',
        'front-end',
        'evaluation',
        'infrastructure'
      ])
    );
    expect(input.jobKeywords).not.toEqual(
      expect.arrayContaining(['class', 'span', 'strong', 'benefits', 'welcome'])
    );
    expect(input.jobKeywords).not.toEqual(expect.arrayContaining(['rust', 'elixir', 'phoenix']));
  });
});
