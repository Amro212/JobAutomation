import { describe, expect, test } from 'vitest';

import type { JobKeywordProfile } from '../../../packages/core/src/job-keyword-profile';
import { prefilterJob, prefilterJobs } from '../../../packages/core/src/job-prefilter';

const baseJob = {
  title: 'Software Engineer',
  location: 'Toronto, ON',
  remoteType: 'onsite',
  descriptionText: 'Build features with the team.'
};

function profile(p: Partial<JobKeywordProfile> & Pick<JobKeywordProfile, 'seniority'>): JobKeywordProfile {
  return {
    target_titles: p.target_titles ?? [],
    positive_keywords: p.positive_keywords ?? [],
    negative_keywords: p.negative_keywords ?? [],
    seniority: p.seniority
  };
}

describe('prefilterJob', () => {
  test('passes when keyword profile is null and no country filter', () => {
    const r = prefilterJob(baseJob, { jobKeywordProfile: null, preferredCountries: [] });
    expect(r.pass).toBe(true);
    expect(r.reasons).toHaveLength(0);
  });

  test('rejects title when a negative keyword matches', () => {
    const r = prefilterJob(
      { ...baseJob, title: 'Sales Development Representative' },
      {
        jobKeywordProfile: profile({ seniority: 'mid', negative_keywords: ['sales'] }),
        preferredCountries: []
      }
    );
    expect(r.pass).toBe(false);
    expect(r.reasons).toContain('title_negative');
  });

  test('rejects title when profile requires a match but title has none', () => {
    const r = prefilterJob(
      { ...baseJob, title: 'Product Designer' },
      {
        jobKeywordProfile: profile({
          seniority: 'mid',
          target_titles: ['software engineer'],
          positive_keywords: []
        }),
        preferredCountries: []
      }
    );
    expect(r.pass).toBe(false);
    expect(r.reasons).toContain('title_no_match');
  });

  test('passes title when a positive keyword matches', () => {
    const r = prefilterJob(
      { ...baseJob, title: 'Staff Designer — TypeScript design systems' },
      {
        jobKeywordProfile: profile({
          seniority: 'senior',
          target_titles: [],
          positive_keywords: ['typescript']
        }),
        preferredCountries: []
      }
    );
    expect(r.pass).toBe(true);
  });

  test('rejects location when countries are set and job is not remote and location does not match', () => {
    const r = prefilterJob(
      { ...baseJob, location: 'Berlin, Germany', remoteType: 'onsite' },
      {
        jobKeywordProfile: null,
        preferredCountries: ['US']
      }
    );
    expect(r.pass).toBe(false);
    expect(r.reasons).toContain('location');
  });

  test('passes location for remote jobs when countries are set', () => {
    const r = prefilterJob(
      { ...baseJob, location: 'EMEA', remoteType: 'remote' },
      {
        jobKeywordProfile: null,
        preferredCountries: ['US']
      }
    );
    expect(r.pass).toBe(true);
  });

  test('passes location when country tokens match', () => {
    const r = prefilterJob(
      { ...baseJob, location: 'San Francisco, CA', remoteType: 'hybrid' },
      {
        jobKeywordProfile: null,
        preferredCountries: ['US']
      }
    );
    expect(r.pass).toBe(true);
  });

  test('rejects junior applicant when description implies minimum years at or above cap', () => {
    const r = prefilterJob(
      {
        ...baseJob,
        descriptionText: 'We need someone with 5+ years of experience in backend systems.'
      },
      {
        jobKeywordProfile: profile({ seniority: 'junior', target_titles: ['engineer'] }),
        preferredCountries: []
      }
    );
    expect(r.pass).toBe(false);
    expect(r.reasons).toContain('experience_min_years');
  });

  test('does not reject senior applicant on years alone', () => {
    const r = prefilterJob(
      {
        ...baseJob,
        descriptionText: 'Minimum 8+ years required.'
      },
      {
        jobKeywordProfile: profile({ seniority: 'senior', target_titles: ['engineer'] }),
        preferredCountries: []
      }
    );
    expect(r.reasons).not.toContain('experience_min_years');
  });
});

describe('prefilterJobs', () => {
  test('splits kept and rejected', () => {
    const ctx = {
      jobKeywordProfile: profile({ seniority: 'mid', negative_keywords: ['nurse'] }),
      preferredCountries: [] as string[]
    };
    const jobs = [
      { ...baseJob, title: 'Platform Engineer' },
      { ...baseJob, title: 'Travel Nurse' }
    ];
    const { kept, rejected } = prefilterJobs(jobs, ctx);
    expect(kept).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reasons).toContain('title_negative');
  });
});
