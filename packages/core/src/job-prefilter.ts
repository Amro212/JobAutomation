import { z } from 'zod';

import type { ApplicantProfile } from './applicant-profile';
import type { JobKeywordProfile, JobKeywordSeniority } from './job-keyword-profile';
import type { JobRecord } from './job';
import { getCountrySearchTokens } from './location-country-filter';

export const prefilterReasonSchema = z.enum([
  'title_negative',
  'title_no_match',
  'location',
  'experience_min_years',
  'seniority_title_mismatch',
  'low_match_score'
]);

export type PrefilterReason = z.infer<typeof prefilterReasonSchema>;

export type MatchSignal =
  | 'target_title'
  | 'profile_title_overlap'
  | 'profile_term_overlap'
  | 'experience_fit'
  | 'location_fit'
  | 'description_evidence'
  | 'low_match_score';

export type DeterministicMatchProfile = {
  targetTitles: string[];
  positiveKeywords: string[];
  negativeKeywords: string[];
  seniority: JobKeywordSeniority | null;
  experienceYears: number | null;
  skills: string[];
  titleTerms: string[];
};

export type PrefilterContext = {
  jobKeywordProfile: JobKeywordProfile | null;
  preferredCountries: string[];
  matchProfile?: DeterministicMatchProfile;
};

export function prefilterContextFromApplicant(profile: ApplicantProfile | null): PrefilterContext {
  const text = profile
    ? [profile.summary, profile.reusableContext, profile.baseResumeTex].join('\n')
    : '';

  return {
    jobKeywordProfile: profile?.jobKeywordProfile ?? null,
    preferredCountries: profile?.preferredCountries ?? [],
    matchProfile: buildDeterministicMatchProfile(profile?.jobKeywordProfile ?? null, text)
  };
}

/** True when the applicant has any saved keyword profile or preferred countries (pre-filter is meaningful). */
export function prefilterMatchesMeaningful(ctx: PrefilterContext): boolean {
  const profile = normalizeMatchProfile(ctx);
  return (
    ctx.jobKeywordProfile != null ||
    ctx.preferredCountries.length > 0 ||
    profile.skills.length > 0 ||
    profile.titleTerms.length > 0 ||
    profile.targetTitles.length > 0
  );
}

export type PrefilterResult = {
  pass: boolean;
  reasons: PrefilterReason[];
  score: number;
  signals: MatchSignal[];
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

const MATCH_PASS_THRESHOLD = 45;
const EXPERIENCE_TOLERANCE_YEARS = 1;
const MAX_PROFILE_TERMS = 80;

const OVER_LEVEL_TITLE_REGEX =
  /\b(?:senior|sr\.?|staff|principal|lead|manager|architect)\b/i;
const EARLY_CAREER_REGEX =
  /\b(?:new\s+grad(?:uate)?|graduate|intern(?:ship)?|entry[-\s]?level|campus|university|0\s*(?:-|to)\s*2\s+years?|1\+?\s+years?)\b/i;

const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'for',
  'from',
  'has',
  'have',
  'in',
  'into',
  'is',
  'it',
  'of',
  'on',
  'or',
  'our',
  'the',
  'their',
  'this',
  'to',
  'with',
  'within',
  'work',
  'working',
  'build',
  'built',
  'using',
  'used',
  'role',
  'team',
  'teams'
]);

function normalizeComparable(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

function normalizeSearchText(text: string): string {
  return ` ${text
    .toLowerCase()
    .replace(/\\[a-z]+/g, ' ')
    .replace(/[{}_[\]()*`~"']/g, ' ')
    .replace(/[^a-z0-9+.#/-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()} `;
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

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set([...values].map((value) => normalizeComparable(value)).filter(Boolean))].sort();
}

function tokenizeTerms(text: string): string[] {
  const matches = normalizeSearchText(text).match(/[a-z0-9]+(?:[+.#/-][a-z0-9]+)*/g) ?? [];
  return matches
    .map((token) => token.replace(/^[./-]+|[./-]+$/g, ''))
    .filter((token) => token.length > 0 && !STOP_WORDS.has(token) && !/^\d+$/.test(token));
}

function extractProfileTerms(text: string): string[] {
  const tokens = tokenizeTerms(text);
  const terms = new Map<string, number>();

  for (let start = 0; start < tokens.length; start += 1) {
    for (let size = 1; size <= 3 && start + size <= tokens.length; size += 1) {
      const parts = tokens.slice(start, start + size);
      if (parts.some((part) => STOP_WORDS.has(part))) {
        continue;
      }
      const term = parts.join(' ');
      const specificity = size * 2 + Math.min(term.length, 24) / 12;
      terms.set(term, (terms.get(term) ?? 0) + specificity);
    }
  }

  return [...terms.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, MAX_PROFILE_TERMS)
    .map(([term]) => term);
}

function extractTitleTerms(titles: string[]): string[] {
  return uniqueSorted(titles.flatMap((title) => extractProfileTerms(title)));
}

function buildDeterministicMatchProfile(
  keywordProfile: JobKeywordProfile | null,
  applicantText: string
): DeterministicMatchProfile {
  const profileText = [
    applicantText,
    ...(keywordProfile?.target_titles ?? []),
    ...(keywordProfile?.positive_keywords ?? [])
  ].join('\n');
  const positiveKeywords = uniqueSorted(keywordProfile?.positive_keywords ?? []);
  const targetTitles = uniqueSorted(keywordProfile?.target_titles ?? []);
  const profileTerms = uniqueSorted([...extractProfileTerms(profileText), ...positiveKeywords]);

  return {
    targetTitles,
    positiveKeywords,
    negativeKeywords: uniqueSorted(keywordProfile?.negative_keywords ?? []),
    seniority: keywordProfile?.seniority ?? null,
    experienceYears: maxImpliedMinYears(profileText) || null,
    skills: profileTerms,
    titleTerms: extractTitleTerms(targetTitles)
  };
}

function normalizeMatchProfile(ctx: PrefilterContext): DeterministicMatchProfile {
  return (
    ctx.matchProfile ??
    buildDeterministicMatchProfile(ctx.jobKeywordProfile, [
      ...(ctx.jobKeywordProfile?.target_titles ?? []),
      ...(ctx.jobKeywordProfile?.positive_keywords ?? [])
    ].join('\n'))
  );
}

function hasPositiveMatchCriteria(profile: DeterministicMatchProfile): boolean {
  return (
    profile.targetTitles.length > 0 ||
    profile.positiveKeywords.length > 0 ||
    profile.skills.length > 0 ||
    profile.titleTerms.length > 0
  );
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

function containsProfileTerm(searchText: string, term: string): boolean {
  const normalized = normalizeSearchText(term).trim();
  if (!normalized) {
    return false;
  }

  const esc = escapeRegExp(normalized).replace(/\\ /g, '\\s+');
  return new RegExp(`(^|[^a-z0-9+#])${esc}([^a-z0-9+#]|$)`, 'i').test(searchText);
}

function passesTitleFilter(
  title: string,
  profile: Pick<DeterministicMatchProfile, 'targetTitles' | 'positiveKeywords' | 'negativeKeywords'>
): PrefilterReason | null {
  const titleNorm = normalizeComparable(title);

  for (const neg of profile.negativeKeywords) {
    if (titleContainsPhrase(titleNorm, neg)) {
      return 'title_negative';
    }
  }

  if (profile.targetTitles.length === 0 && profile.positiveKeywords.length === 0) {
    return null;
  }

  for (const t of profile.targetTitles) {
    if (titleContainsPhrase(titleNorm, t)) {
      return null;
    }
  }

  for (const k of profile.positiveKeywords) {
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

function passesExperienceFilter(descriptionText: string, profile: DeterministicMatchProfile): PrefilterReason | null {
  if (profile.experienceYears == null) {
    return null;
  }

  const implied = maxImpliedMinYears(descriptionText);
  if (implied > profile.experienceYears + EXPERIENCE_TOLERANCE_YEARS) {
    return 'experience_min_years';
  }

  return null;
}

function passesSeniorityTitleFilter(
  title: string,
  descriptionText: string,
  profile: DeterministicMatchProfile
): PrefilterReason | null {
  if (profile.seniority !== 'new_grad' && profile.seniority !== 'junior') {
    return null;
  }

  if (!OVER_LEVEL_TITLE_REGEX.test(title)) {
    return null;
  }

  if (EARLY_CAREER_REGEX.test(`${title}\n${descriptionText}`)) {
    return null;
  }

  return 'seniority_title_mismatch';
}

export type PrefilterJobInput = Pick<JobRecord, 'title' | 'location' | 'remoteType' | 'descriptionText'>;

function scoreJobMatch(
  job: PrefilterJobInput,
  ctx: PrefilterContext,
  locationPass: boolean,
  experiencePass: boolean
): { score: number; signals: MatchSignal[] } {
  if (!prefilterMatchesMeaningful(ctx)) {
    return { score: 0, signals: [] };
  }

  const profile = normalizeMatchProfile(ctx);
  const titleNorm = normalizeComparable(job.title);
  const titleText = normalizeSearchText(job.title);
  const fullText = `${job.title}\n${job.descriptionText}`;
  const fullSearchText = normalizeSearchText(fullText);
  const titleOverlap = profile.skills.filter((term) => containsProfileTerm(titleText, term));
  const profileTermOverlap = profile.skills.filter((term) => containsProfileTerm(fullSearchText, term));
  const targetTitleMatch = profile.targetTitles.some((title) => titleContainsPhrase(titleNorm, title));
  const keywordTitleMatch = profile.positiveKeywords.some((keyword) =>
    titleContainsPhrase(titleNorm, keyword)
  );

  let score = 0;
  const signals: MatchSignal[] = [];

  if (targetTitleMatch) {
    score += 30;
    signals.push('target_title');
  } else if (titleOverlap.length > 0) {
    score += Math.min(30, titleOverlap.length * 10);
    signals.push('profile_title_overlap');
  } else if (keywordTitleMatch) {
    score += 20;
    signals.push('target_title');
  }

  if (profileTermOverlap.length > 0) {
    score += Math.min(
      40,
      profileTermOverlap.reduce((total, term) => total + (term.includes(' ') ? 8 : 5), 0)
    );
    signals.push('profile_term_overlap');
  }

  if (experiencePass) {
    score += 15;
    signals.push('experience_fit');
  }

  if (locationPass) {
    score += 10;
    signals.push('location_fit');
  }

  if (profileTermOverlap.length >= 2 || titleOverlap.length > 0) {
    score += 10;
    signals.push('description_evidence');
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    signals: uniqueSorted(signals) as MatchSignal[]
  };
}

export function prefilterJob(job: PrefilterJobInput, ctx: PrefilterContext): PrefilterResult {
  const reasons: PrefilterReason[] = [];

  const profile = normalizeMatchProfile(ctx);
  const titleReason = passesTitleFilter(job.title, profile);
  if (titleReason === 'title_negative') {
    reasons.push(titleReason);
  }

  const locationPass = passesLocationFilter(job.location, job.remoteType, ctx.preferredCountries);
  if (!locationPass) {
    reasons.push('location');
  }

  const expReason = passesExperienceFilter(job.descriptionText, profile);
  const experiencePass = expReason == null;
  if (expReason) {
    reasons.push(expReason);
  }

  const seniorityReason = passesSeniorityTitleFilter(job.title, job.descriptionText, profile);
  if (seniorityReason) {
    reasons.push(seniorityReason);
  }

  const scored = scoreJobMatch(job, ctx, locationPass, experiencePass);
  if (
    reasons.length === 0 &&
    hasPositiveMatchCriteria(profile) &&
    scored.score < MATCH_PASS_THRESHOLD
  ) {
    reasons.push('low_match_score');
    scored.signals.push('low_match_score');
  }

  return {
    pass: reasons.length === 0,
    reasons,
    score: scored.score,
    signals: uniqueSorted(scored.signals) as MatchSignal[]
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
