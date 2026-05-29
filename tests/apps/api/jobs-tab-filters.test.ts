import { describe, expect, test } from 'vitest';

import { defaultJobListFiltersFromApplicant } from '../../../apps/api/src/services/jobs-tab-filters';
import type { ApplicantProfile } from '@jobautomation/core';

function profile(overrides: Partial<ApplicantProfile> = {}): ApplicantProfile {
  return {
    id: 'default',
    fullName: 'Taylor Example',
    email: 'taylor@example.com',
    phone: '555-0100',
    location: 'Toronto, ON',
    summary: 'Engineer',
    reusableContext: 'Builds systems.',
    linkedinUrl: null,
    websiteUrl: null,
    baseResumeFileName: 'resume.tex',
    baseResumeTex: '\\section{Experience}',
    jobKeywordProfile: {
      seniority: 'mid',
      target_titles: ['platform engineer'],
      positive_keywords: ['typescript'],
      negative_keywords: []
    },
    preferredCountries: ['CA'],
    ...overrides
  };
}

describe('defaultJobListFiltersFromApplicant', () => {
  test('uses My matches when a keyword profile exists', () => {
    expect(defaultJobListFiltersFromApplicant(profile())).toEqual({
      sourceKind: undefined,
      status: undefined,
      remoteType: undefined,
      title: undefined,
      location: undefined,
      companyName: undefined,
      locationCountries: undefined,
      matchProfile: 'me'
    });
  });

  test('uses all jobs when profile has no match scope', () => {
    expect(
      defaultJobListFiltersFromApplicant(
        profile({
          summary: '',
          reusableContext: '',
          baseResumeTex: '',
          jobKeywordProfile: null,
          preferredCountries: []
        })
      )
    ).toEqual({
      sourceKind: undefined,
      status: undefined,
      remoteType: undefined,
      title: undefined,
      location: undefined,
      companyName: undefined,
      locationCountries: undefined,
      matchProfile: 'all'
    });
  });
});
