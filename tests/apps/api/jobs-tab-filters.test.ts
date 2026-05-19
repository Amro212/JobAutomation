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
  test('uses My matches and Setup countries when profile is meaningful', () => {
    expect(defaultJobListFiltersFromApplicant(profile())).toEqual({
      matchProfile: 'me',
      locationCountries: ['CA']
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
      matchProfile: 'all'
    });
  });
});
