import { z } from 'zod';

import type { ApplicantProfile } from './applicant-profile';
import type { JobKeywordProfile, JobKeywordSeniority } from './job-keyword-profile';
import type { JobRecord } from './job';
import { getCountrySearchTokens } from './location-country-filter';

export const prefilterReasonSchema = z.enum([
  'title_negative',
  'title_no_match',
  'location',
  'experience_min_years'
]);

export type PrefilterReason = z.infer<typeof prefilterReasonSchema>;

export type PrefilterContext = {
  jobKeywordProfile: JobKeywordProfile | null;
  preferredCountries: string[];
};

export function prefilterContextFromApplicant(profile: ApplicantProfile | null): PrefilterContext {
  return {
    jobKeywordProfile: profile?.jobKeywordProfile ?? null,
    preferredCountries: profile?.preferredCountries ?? []
  };
}

/** True when the applicant has any saved keyword profile or preferred countries (pre-filter is meaningful). */
export function prefilterMatchesMeaningful(ctx: PrefilterContext): boolean {
  return ctx.jobKeywordProfile != null || ctx.preferredCountries.length > 0;
}

export type PrefilterResult = {
  pass: boolean;
  reasons: PrefilterReason[];
};

/** Max "minimum years" implied in posting text before we reject, by applicant seniority. null = do not reject on years. */
const SENIORITY_MAX_MIN_YEARS: Record<JobKeywordSeniority, number | null> = {
  new_grad: 2,
  junior: 5,
  mid: 8,
  senior: null,
  lead: null
};

/**
 * Phrases that imply a minimum experience requirement; capture the first number group.
 * Kept conservative to reduce false positives from prose like "within 5 years".
 */
const EXPERIENCE_REGEXES: RegExp[] = [
  /\b(?:at least|minimum of|min\.?)\s+(\d+)\s*\+?\s*(?:-\s*\d+\+?)?\s*years?\b/gi,
  /\b(\d+)\s*\+\s*years?\s+of\s+experience\b/gi,
  /\b(\d+)\s*\+\s*years?\b/gi
];

function normalizeComparable(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Match a user keyword or title phrase against a normalized job title.
 * Multi-word phrases use substring match. Single tokens with length <= 3 use boundary-aware
 * matching so values like "c" or "js" do not match inside "social", "workplace", or "json".
 */
function titleContainsPhrase(titleNorm: string, phrase: string): boolean {
  const p = normalizeComparable(phrase);
  if (!p) {
    return false;
  }
  if (p.includes(' ')) {
    return titleNorm.includes(p);
  }
  if (p.length <= 3) {
    const esc = escapeRegExp(p);
    const re = new RegExp(`(^|[^a-z0-9+.#])${esc}([^a-z0-9+.#]|$)`, 'i');
    return re.test(titleNorm);
  }
  return titleNorm.includes(p);
}

function maxImpliedMinYears(description: string): number {
  let max = 0;
  const text = description.toLowerCase();

  for (const re of EXPERIENCE_REGEXES) {
    const withG = new RegExp(re.source, re.flags);
    let m: RegExpExecArray | null;
    while ((m = withG.exec(text)) !== null) {
      const n = Number.parseInt(m[1] ?? '', 10);
      if (Number.isFinite(n)) {
        max = Math.max(max, n);
      }
    }
  }

  return max;
}

function passesTitleFilter(title: string, profile: JobKeywordProfile | null): PrefilterReason | null {
  const titleNorm = normalizeComparable(title);

  const negatives = profile?.negative_keywords ?? [];
  for (const neg of negatives) {
    if (titleContainsPhrase(titleNorm, neg)) {
      return 'title_negative';
    }
  }

  if (!profile) {
    return null;
  }

  const titles = profile.target_titles ?? [];
  const positives = profile.positive_keywords ?? [];
  if (titles.length === 0 && positives.length === 0) {
    return null;
  }

  for (const t of titles) {
    if (titleContainsPhrase(titleNorm, t)) {
      return null;
    }
  }

  for (const k of positives) {
    if (titleContainsPhrase(titleNorm, k)) {
      return null;
    }
  }

  return 'title_no_match';
}

function passesLocationFilter(
  location: string,
  remoteType: string,
  preferredCountries: string[]
): boolean {
  if (!preferredCountries.length) {
    return true;
  }

  if (remoteType === 'remote') {
    return true;
  }

  const locNorm = location.toLowerCase();

  for (const code of preferredCountries) {
    for (const token of getCountrySearchTokens(code)) {
      if (locNorm.includes(token)) {
        return true;
      }
    }
  }

  return false;
}

function passesExperienceFilter(
  descriptionText: string,
  profile: JobKeywordProfile | null
): PrefilterReason | null {
  if (!profile) {
    return null;
  }

  const cap = SENIORITY_MAX_MIN_YEARS[profile.seniority];
  if (cap == null) {
    return null;
  }

  const implied = maxImpliedMinYears(descriptionText);
  if (implied >= cap) {
    return 'experience_min_years';
  }

  return null;
}

export type PrefilterJobInput = Pick<JobRecord, 'title' | 'location' | 'remoteType' | 'descriptionText'>;

export function prefilterJob(job: PrefilterJobInput, ctx: PrefilterContext): PrefilterResult {
  const reasons: PrefilterReason[] = [];

  const titleReason = passesTitleFilter(job.title, ctx.jobKeywordProfile);
  if (titleReason) {
    reasons.push(titleReason);
  }

  if (!passesLocationFilter(job.location, job.remoteType, ctx.preferredCountries)) {
    reasons.push('location');
  }

  const expReason = passesExperienceFilter(job.descriptionText, ctx.jobKeywordProfile);
  if (expReason) {
    reasons.push(expReason);
  }

  return {
    pass: reasons.length === 0,
    reasons
  };
}

export function prefilterJobs<T extends PrefilterJobInput>(
  jobs: T[],
  ctx: PrefilterContext
): {
  kept: T[];
  rejected: Array<{ job: T; reasons: PrefilterReason[] }>;
} {
  const kept: T[] = [];
  const rejected: Array<{ job: T; reasons: PrefilterReason[] }> = [];

  for (const job of jobs) {
    const result = prefilterJob(job, ctx);
    if (result.pass) {
      kept.push(job);
    } else {
      rejected.push({ job, reasons: result.reasons });
    }
  }

  return { kept, rejected };
}
