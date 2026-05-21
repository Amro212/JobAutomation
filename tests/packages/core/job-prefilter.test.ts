import { describe, expect, test } from 'vitest';

import type { ApplicantProfile } from '../../../packages/core/src/applicant-profile';
import { minimalAutofillProfileSchema } from '../../../packages/core/src/autofill-profile';
import type { JobKeywordProfile } from '../../../packages/core/src/job-keyword-profile';
import {
  prefilterContextFromApplicant,
  prefilterJob,
  prefilterJobs,
  prefilterMatchesMeaningful
} from '../../../packages/core/src/job-prefilter';

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
    seniority: p.seniority,
    allowed_role_families: p.allowed_role_families ?? ['engineering'],
    must_have_keywords: p.must_have_keywords ?? [],
    nice_to_have_keywords: p.nice_to_have_keywords ?? [],
    negative_role_terms: p.negative_role_terms ?? [],
    max_required_years: p.max_required_years ?? null
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

  test('rejects low-evidence jobs when profile title has no supporting match', () => {
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
    expect(r.reasons).toContain('role_family_mismatch');
  });

  test('keeps strong description matches even when the title is not an exact target title', () => {
    const r = prefilterJob(
      {
        ...baseJob,
        title: 'Developer Tooling Engineer',
        descriptionText:
          'Build TypeScript, Node.js, and Playwright automation for a job application platform.'
      },
      {
        jobKeywordProfile: profile({
          seniority: 'mid',
          target_titles: ['software engineer'],
          positive_keywords: ['typescript', 'node.js', 'playwright', 'automation']
        }),
        preferredCountries: []
      }
    );

    expect(r.pass).toBe(true);
    expect(r.score).toBeGreaterThanOrEqual(45);
    expect(r.reasons).not.toContain('title_no_match');
  });

  test('rejects unrelated jobs with a low deterministic match score instead of title mismatch alone', () => {
    const r = prefilterJob(
      {
        ...baseJob,
        title: 'Line Cook',
        descriptionText: 'Prepare ingredients and support dinner service.'
      },
      {
        jobKeywordProfile: profile({
          seniority: 'mid',
          target_titles: ['software engineer'],
          positive_keywords: ['typescript', 'node.js', 'playwright', 'automation']
        }),
        preferredCountries: []
      }
    );

    expect(r.pass).toBe(false);
    expect(r.reasons).toContain('role_family_mismatch');
    expect(r.score).toBeLessThan(45);
  });

  test('rejects senior title for new-grad profile even when broad keywords match', () => {
    const r = prefilterJob(
      {
        ...baseJob,
        title: 'Senior Software Engineer',
        descriptionText:
          'Build TypeScript services with React, Node.js, Playwright, Docker, Kubernetes, and AWS.'
      },
      {
        jobKeywordProfile: profile({
          seniority: 'new_grad',
          target_titles: ['software engineer'],
          positive_keywords: ['typescript', 'react', 'node.js', 'playwright', 'docker', 'aws']
        }),
        preferredCountries: []
      }
    );

    expect(r.pass).toBe(false);
    expect(r.reasons).toContain('seniority_title_mismatch');
  });

  test.each([
    'Staff Software Engineer',
    'Principal Backend Engineer',
    'Lead Software Engineer',
    'Engineering Manager'
  ])('rejects over-level title "%s" for junior profile', (title) => {
    const r = prefilterJob(
      {
        ...baseJob,
        title,
        descriptionText: 'Build software systems with TypeScript and backend services.'
      },
      {
        jobKeywordProfile: profile({
          seniority: 'junior',
          target_titles: ['software engineer', 'backend engineer'],
          positive_keywords: ['typescript', 'backend']
        }),
        preferredCountries: []
      }
    );

    expect(r.pass).toBe(false);
    expect(r.reasons).toContain('seniority_title_mismatch');
  });

  test.each(['New Graduate Software Engineer', 'Software Engineer Internship'])(
    'allows early-career title "%s" for new-grad profile',
    (title) => {
      const r = prefilterJob(
        {
          ...baseJob,
          title,
          descriptionText: 'Entry level role for university graduates building TypeScript services.'
        },
        {
          jobKeywordProfile: profile({
            seniority: 'new_grad',
            target_titles: ['software engineer'],
            positive_keywords: ['typescript']
          }),
          preferredCountries: []
        }
      );

      expect(r.pass).toBe(true);
      expect(r.reasons).not.toContain('seniority_title_mismatch');
    }
  );

  test('passes title when a positive keyword matches', () => {
    const r = prefilterJob(
      { ...baseJob, title: 'TypeScript Developer' },
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

  test('does not treat single-char language keywords as substring of unrelated words', () => {
    const ctx = {
      jobKeywordProfile: profile({
        seniority: 'mid',
        target_titles: [],
        positive_keywords: ['c']
      }),
      preferredCountries: [] as string[]
    };
    expect(
      prefilterJob({ ...baseJob, title: 'Workplace Manager' }, ctx).reasons
    ).toContain('role_family_mismatch');
    expect(
      prefilterJob({ ...baseJob, title: 'Social Marketing Manager' }, ctx).reasons
    ).toContain('role_family_mismatch');
    expect(prefilterJob({ ...baseJob, title: 'C Developer' }, ctx).pass).toBe(true);
  });

  test('matches short tokens with symbols when bounded (e.g. c++)', () => {
    const r = prefilterJob(
      { ...baseJob, title: 'Senior C++ Developer' },
      {
        jobKeywordProfile: profile({
          seniority: 'senior',
          target_titles: [],
          positive_keywords: ['c++']
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

  test('rejects remote jobs with region-specific location when countries are set', () => {
    const r = prefilterJob(
      { ...baseJob, location: 'EMEA', remoteType: 'remote' },
      {
        jobKeywordProfile: null,
        preferredCountries: ['US']
      }
    );
    expect(r.pass).toBe(false);
    expect(r.reasons).toContain('location');
  });

  test('passes generic remote jobs when countries are set', () => {
    const r = prefilterJob(
      { ...baseJob, location: 'Remote', remoteType: 'remote' },
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

  test('rejects when job minimum years clearly exceeds profile experience evidence', () => {
    const r = prefilterJob(
      {
        ...baseJob,
        descriptionText: 'We need someone with 5+ years of experience in backend systems.'
      },
      {
        jobKeywordProfile: null,
        preferredCountries: [],
        matchProfile: {
          targetTitles: ['engineer'],
          positiveKeywords: ['backend systems'],
          negativeKeywords: [],
          seniority: null,
          experienceYears: 2,
          skills: ['engineer', 'backend', 'systems', 'backend systems'],
          titleTerms: ['engineer']
        }
      }
    );
    expect(r.pass).toBe(false);
    expect(r.reasons).toContain('experience_min_years');
  });

  test('does not reject when profile experience evidence satisfies the job minimum', () => {
    const r = prefilterJob(
      {
        ...baseJob,
        descriptionText: 'Minimum 8+ years required.'
      },
      {
        jobKeywordProfile: null,
        preferredCountries: [],
        matchProfile: {
          targetTitles: ['engineer'],
          positiveKeywords: ['platform systems'],
          negativeKeywords: [],
          seniority: null,
          experienceYears: 10,
          skills: ['engineer', 'platform', 'systems', 'platform systems'],
          titleTerms: ['engineer']
        }
      }
    );
    expect(r.reasons).not.toContain('experience_min_years');
  });

  test.each([
    ['Revenue Operations Analyst', 'Own CRM data quality, GTM reporting, revenue operations automation, SQL, and AI workflows.'],
    ['Office Coordinator', 'Coordinate a software company office while supporting automation, product, and engineering teams.'],
    ['People Operations Coordinator', 'Support people operations systems, onboarding workflows, analytics, and internal tools.'],
    ['Compliance Officer - North America', 'Use automation systems and dashboards to manage compliance programs.'],
    ['Chief Operating Officer - Canada', 'Translate strategy into execution for a software consulting business.']
  ])('rejects wrong role family "%s" despite technical text', (title, descriptionText) => {
    const r = prefilterJob(
      { ...baseJob, title, descriptionText },
      {
        jobKeywordProfile: profile({
          seniority: 'new_grad',
          target_titles: ['software engineer', 'software developer', 'automation engineer'],
          positive_keywords: ['typescript', 'python', 'automation', 'ai workflows', 'sql']
        }),
        preferredCountries: []
      }
    );

    expect(r.pass).toBe(false);
    expect(r.reasons).toContain('role_family_mismatch');
  });

  test('rejects new-grad engineering roles with hard over-level year requirements', () => {
    const r = prefilterJob(
      {
        ...baseJob,
        title: 'Software Engineer - Full Stack',
        descriptionText: 'Build React and Node.js systems. Requirements: 5+ years of software engineering experience.'
      },
      {
        jobKeywordProfile: profile({
          seniority: 'new_grad',
          target_titles: ['software engineer'],
          positive_keywords: ['react', 'node.js', 'typescript']
        }),
        preferredCountries: []
      }
    );

    expect(r.pass).toBe(false);
    expect(r.reasons).toContain('experience_min_years');
  });

  test('allows a strong new-grad engineering role with entry-level evidence', () => {
    const r = prefilterJob(
      {
        ...baseJob,
        title: 'Associate Software Engineer',
        descriptionText:
          'Entry-level role for new graduates building TypeScript, React, and Node.js product features.'
      },
      {
        jobKeywordProfile: profile({
          seniority: 'new_grad',
          target_titles: ['software engineer', 'frontend developer', 'backend developer'],
          positive_keywords: ['typescript', 'react', 'node.js']
        }),
        preferredCountries: []
      }
    );

    expect(r.pass).toBe(true);
    expect(r.score).toBeGreaterThanOrEqual(60);
    expect(r.signals).toContain('role_family_fit');
  });

  test('flags a 3+ years new-grad engineering role as borderline instead of hard rejecting', () => {
    const r = prefilterJob(
      {
        ...baseJob,
        title: 'Software Engineer I',
        descriptionText:
          'Build TypeScript backend services and APIs. Preferred: 3+ years of professional software engineering experience.'
      },
      {
        jobKeywordProfile: profile({
          seniority: 'new_grad',
          target_titles: ['software engineer', 'backend developer'],
          positive_keywords: ['typescript', 'api', 'backend']
        }),
        preferredCountries: []
      }
    );

    expect(r.pass).toBe(true);
    expect(r.signals).toContain('llm_review_recommended');
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

describe('prefilterContextFromApplicant', () => {
  test('maps stored applicant fields into pre-filter context', () => {
    const applicant = {
      id: 'default',
      fullName: 'A',
      email: '',
      phone: '',
      location: '',
      summary: '',
      reusableContext: '',
      linkedinUrl: '',
      websiteUrl: '',
      baseResumeFileName: '',
      baseResumeTex: '',
      preferredCountries: ['CA'],
      jobKeywordProfile: profile({ seniority: 'mid', positive_keywords: ['rust'] }),
      jobKeywordProfileGeneratedAt: null,
      autofillProfile: minimalAutofillProfileSchema.parse({}),
      updatedAt: new Date()
    } satisfies ApplicantProfile;

    const ctx = prefilterContextFromApplicant(applicant);
    expect(ctx.preferredCountries).toEqual(['CA']);
    expect(ctx.jobKeywordProfile?.positive_keywords).toContain('rust');
  });

  test('builds a deterministic match profile from resume and context without generated keywords', () => {
    const applicant = {
      id: 'default',
      fullName: 'A',
      email: '',
      phone: '',
      location: '',
      summary: 'Full-stack software engineer focused on TypeScript and React.',
      reusableContext: 'Built Playwright automation and Node.js services.',
      linkedinUrl: '',
      websiteUrl: '',
      baseResumeFileName: '',
      baseResumeTex: '\\section{Skills} TypeScript, React, Node.js, Playwright',
      preferredCountries: [],
      jobKeywordProfile: null,
      jobKeywordProfileGeneratedAt: null,
      autofillProfile: minimalAutofillProfileSchema.parse({}),
      updatedAt: new Date()
    } satisfies ApplicantProfile;

    const ctx = prefilterContextFromApplicant(applicant);

    expect(prefilterMatchesMeaningful(ctx)).toBe(true);
    expect(ctx.matchProfile.skills).toEqual(
      expect.arrayContaining(['typescript', 'react', 'node.js', 'playwright'])
    );
    expect(ctx.matchProfile.skills).toEqual(expect.arrayContaining(['software engineer']));
  });
});

describe('prefilterMatchesMeaningful', () => {
  test('is false when there is no keyword profile and no countries', () => {
    expect(
      prefilterMatchesMeaningful({
        jobKeywordProfile: null,
        preferredCountries: []
      })
    ).toBe(false);
  });

  test('is true when preferred countries are set', () => {
    expect(
      prefilterMatchesMeaningful({
        jobKeywordProfile: null,
        preferredCountries: ['US']
      })
    ).toBe(true);
  });

  test('is true when a keyword profile exists', () => {
    expect(
      prefilterMatchesMeaningful({
        jobKeywordProfile: profile({ seniority: 'mid' }),
        preferredCountries: []
      })
    ).toBe(true);
  });
});
