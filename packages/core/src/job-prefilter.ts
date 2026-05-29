import { z } from 'zod';

import type { ApplicantProfile } from './applicant-profile';
import type { JobKeywordProfile, JobKeywordSeniority } from './job-keyword-profile';
import type { JobRecord } from './job';
import { getCountrySearchTokens } from './location-country-filter';

export const JOB_MATCHER_VERSION = 'hybrid-v2';

export const prefilterReasonSchema = z.enum([
  'title_negative',
  'title_no_match',
  'location',
  'role_family_mismatch',
  'experience_min_years',
  'seniority_title_mismatch',
  'llm_veto',
  'low_match_score'
]);

export type PrefilterReason = z.infer<typeof prefilterReasonSchema>;

export type MatchSignal =
  | 'role_family_fit'
  | 'target_title'
  | 'profile_title_overlap'
  | 'profile_term_overlap'
  | 'experience_fit'
  | 'years_soft_cap'
  | 'seniority_fit'
  | 'description_evidence'
  | 'llm_review_recommended'
  | 'low_match_score';

export type DeterministicMatchProfile = {
  targetTitles: string[];
  positiveKeywords: string[];
  negativeKeywords: string[];
  mustHaveKeywords: string[];
  niceToHaveKeywords: string[];
  negativeRoleTerms: string[];
  seniority: JobKeywordSeniority | null;
  experienceYears: number | null;
  maxRequiredYears: number | null;
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
    ctx.preferredCountries.length > 0 ||
    ctx.jobKeywordProfile != null ||
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
  audit: PrefilterAudit;
};

export type PrefilterAudit = {
  matcherVersion: typeof JOB_MATCHER_VERSION;
  decision: 'pass' | 'reject';
  score: number;
  reasons: PrefilterReason[];
  signals: MatchSignal[];
  roleFamily: {
    name: 'engineering' | 'wrong_role' | 'unknown';
    matched: boolean;
  };
  evidence: {
    matchedTitleTerms: string[];
    matchedKeywords: string[];
    matchedSkills: string[];
    missingMustHaveKeywords: string[];
  };
  seniority: {
    profile: JobKeywordSeniority | null;
    earlyCareerSignal: boolean;
    minYearsRequired: number | null;
    softExperienceCap: boolean;
  };
  llm: {
    reviewed: boolean;
    pass: boolean | null;
    rationale: string | null;
    reasonCodes: string[];
  };
};

const EXPERIENCE_REGEX =
  /\b(\d+)\s*(?:\+|\s*(?:-|–|—|to)\s*(\d+))?\s*years?\b/gi;
const REQUIRED_EXPERIENCE_CONTEXT_REGEX =
  /\b(?:required|requirements?|must(?:\s+have)?|minimum|min\.?|at\s+least|need(?:ed)?|requires?)\b/i;
const PREFERRED_EXPERIENCE_CONTEXT_REGEX =
  /\b(?:preferred|bonus|nice[-\s]?to[-\s]?have|plus|ideally|would\s+be\s+(?:a\s+)?plus)\b/i;

const MATCH_PASS_THRESHOLD = 45;
const EXPERIENCE_TOLERANCE_YEARS = 1;
const MAX_PROFILE_TERMS = 80;

const OVER_LEVEL_TITLE_REGEX =
  /\b(?:senior|sr\.?|staff|principal|lead|manager|architect|director|head|chief|vp)\b/i;
const EARLY_CAREER_REGEX =
  /\b(?:new\s+grad(?:uate)?|graduate|intern(?:ship)?|entry[-\s]?level|early\s+career|campus|university|associate|software\s+engineer\s+i\b|developer\s+i\b|0\s*(?:-|to)\s*2\s+years?|1\+?\s+years?)\b/i;

const ENGINEERING_TITLE_REGEX =
  /\b(?:(?:software|frontend|front[-\s]?end|backend|back[-\s]?end|full[-\s]?stack|platform|infrastructure|automation|devops|cloud|site reliability|sre|embedded|mobile|android|ios|web|application|api|ai|machine learning|ml)\s+(?:engineer|developer)|(?:engineer|developer)\s*(?:i|1)\b|software\s+(?:engineer|developer)|developer\s+tooling\s+engineer|developer\s+intern|sdet|qa\s+automation|test\s+automation|software\s+engineer\s+in\s+test|quality\s+engineer)\b/i;
const GENERIC_ENGINEERING_TITLE_REGEX = /\b(?:software|engineer|developer|devops|sdet)\b/i;
const WRONG_ROLE_TITLE_REGEX =
  /\b(?:revenue\s+operations|revops|go[-\s]?to[-\s]?market|gtm|sales\s+operations|people\s+operations|people\s+success|office\s+(?:coordinator|manager|administrator)|operations\s+coordinator|program\s+operations|compliance\s+officer|chief\s+operating\s+officer|coo|account\s+executive|customer\s+support|technical\s+support|support\s+specialist|recruiter|human\s+resources|marketing|sales|finance|treasury|accounts?\s+payable)\b/i;
const GENERIC_WRONG_ROLE_REGEX =
  /\b(?:coordinator|officer|analyst|consultant|administrator|specialist|scientist|designer)\b/i;

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
  const mustHaveKeywords = uniqueSorted(keywordProfile?.must_have_keywords ?? []);
  const niceToHaveKeywords = uniqueSorted(keywordProfile?.nice_to_have_keywords ?? []);
  const targetTitles = uniqueSorted(keywordProfile?.target_titles ?? []);
  const profileTerms = uniqueSorted([
    ...extractProfileTerms(profileText),
    ...positiveKeywords,
    ...mustHaveKeywords,
    ...niceToHaveKeywords
  ]);

  return {
    targetTitles,
    positiveKeywords: uniqueSorted([...positiveKeywords, ...mustHaveKeywords, ...niceToHaveKeywords]),
    negativeKeywords: uniqueSorted([
      ...(keywordProfile?.negative_keywords ?? []),
      ...(keywordProfile?.negative_role_terms ?? [])
    ]),
    mustHaveKeywords,
    niceToHaveKeywords,
    negativeRoleTerms: uniqueSorted(keywordProfile?.negative_role_terms ?? []),
    seniority: keywordProfile?.seniority ?? null,
    experienceYears: maxImpliedMinYears(profileText) || null,
    maxRequiredYears: keywordProfile?.max_required_years ?? null,
    skills: profileTerms,
    titleTerms: extractTitleTerms(targetTitles)
  };
}

function normalizeMatchProfile(ctx: PrefilterContext): DeterministicMatchProfile {
  const profile =
    ctx.matchProfile ??
    buildDeterministicMatchProfile(ctx.jobKeywordProfile, [
      ...(ctx.jobKeywordProfile?.target_titles ?? []),
      ...(ctx.jobKeywordProfile?.positive_keywords ?? [])
    ].join('\n'));

  return {
    ...profile,
    mustHaveKeywords: profile.mustHaveKeywords ?? [],
    niceToHaveKeywords: profile.niceToHaveKeywords ?? [],
    negativeRoleTerms: profile.negativeRoleTerms ?? [],
    maxRequiredYears: profile.maxRequiredYears ?? null
  };
}

function hasPositiveMatchCriteria(profile: DeterministicMatchProfile): boolean {
  return (
    profile.targetTitles.length > 0 ||
    profile.positiveKeywords.length > 0 ||
    profile.skills.length > 0 ||
    profile.titleTerms.length > 0
  );
}

function maxImpliedMinYears(
  description: string,
  options: { includePreferred?: boolean; requiredOnly?: boolean } = {}
): number {
  let max = 0;
  const text = description.toLowerCase().replace(/[–—]/g, '-');

  let m: RegExpExecArray | null;
  while ((m = EXPERIENCE_REGEX.exec(text)) !== null) {
    const before = text.slice(Math.max(0, m.index - 80), m.index);
    const after = text.slice(m.index + m[0].length, m.index + m[0].length + 40);
    if (!options.includePreferred && PREFERRED_EXPERIENCE_CONTEXT_REGEX.test(before)) {
      continue;
    }
    if (
      options.requiredOnly &&
      !REQUIRED_EXPERIENCE_CONTEXT_REGEX.test(before) &&
      !REQUIRED_EXPERIENCE_CONTEXT_REGEX.test(after)
    ) {
      continue;
    }

    const lower = Number.parseInt(m[1] ?? '', 10);
    const upper = Number.parseInt(m[2] ?? '', 10);
    const n = Number.isFinite(upper) ? upper : lower;
    if (Number.isFinite(n)) {
      max = Math.max(max, n);
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

function passesExperienceFilter(descriptionText: string, profile: DeterministicMatchProfile): PrefilterReason | null {
  const implied = maxImpliedMinYears(descriptionText, { requiredOnly: true });

  if (implied === 0) {
    return null;
  }

  if (profile.maxRequiredYears != null && implied > profile.maxRequiredYears) {
    return 'experience_min_years';
  }

  if (
    (profile.seniority === 'new_grad' || profile.seniority === 'junior') &&
    implied >= 4 &&
    !EARLY_CAREER_REGEX.test(descriptionText)
  ) {
    return 'experience_min_years';
  }

  if (profile.experienceYears != null && implied > profile.experienceYears + EXPERIENCE_TOLERANCE_YEARS) {
    return 'experience_min_years';
  }

  return null;
}

function hasSoftExperienceCap(descriptionText: string, profile: DeterministicMatchProfile): boolean {
  if (profile.seniority !== 'new_grad' && profile.seniority !== 'junior') {
    return false;
  }

  const implied = maxImpliedMinYears(descriptionText, { includePreferred: true });
  return implied === 3 && !EARLY_CAREER_REGEX.test(descriptionText);
}

function passesRoleFamilyFilter(
  title: string,
  profile: DeterministicMatchProfile
): { pass: boolean; explicitFit: boolean } {
  const titleNorm = normalizeComparable(title);

  if (WRONG_ROLE_TITLE_REGEX.test(titleNorm)) {
    return { pass: false, explicitFit: false };
  }

  const explicitFit =
    ENGINEERING_TITLE_REGEX.test(titleNorm) ||
    profile.targetTitles.some((target) => titleContainsPhrase(titleNorm, target));

  if (explicitFit) {
    return { pass: true, explicitFit: true };
  }

  if (GENERIC_WRONG_ROLE_REGEX.test(titleNorm)) {
    return { pass: false, explicitFit: false };
  }

  if (hasPositiveMatchCriteria(profile)) {
    return { pass: GENERIC_ENGINEERING_TITLE_REGEX.test(titleNorm), explicitFit: false };
  }

  return { pass: true, explicitFit: false };
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

function isGenericRemoteLocation(location: string): boolean {
  if (!location) {
    return true;
  }

  return /^(remote|anywhere|worldwide|global|distributed|work from home|wfh)$/i.test(location);
}

function passesLocationFilter(job: PrefilterJobInput, preferredCountries: string[]): boolean {
  if (preferredCountries.length === 0) {
    return true;
  }

  const location = normalizeComparable(job.location);

  if (job.remoteType === 'remote' && isGenericRemoteLocation(location)) {
    return true;
  }

  return preferredCountries.some((code) =>
    getCountrySearchTokens(code).some((token) => location.includes(token))
  );
}

function scoreJobMatch(
  job: PrefilterJobInput,
  ctx: PrefilterContext,
  experiencePass: boolean,
  roleFamilyFit: boolean,
  softExperienceCap: boolean
): {
  score: number;
  signals: MatchSignal[];
  matchedTitleTerms: string[];
  matchedKeywords: string[];
  matchedSkills: string[];
  missingMustHaveKeywords: string[];
} {
  if (!prefilterMatchesMeaningful(ctx)) {
    return {
      score: 0,
      signals: [],
      matchedTitleTerms: [],
      matchedKeywords: [],
      matchedSkills: [],
      missingMustHaveKeywords: []
    };
  }

  const profile = normalizeMatchProfile(ctx);
  const titleNorm = normalizeComparable(job.title);
  const titleText = normalizeSearchText(job.title);
  const fullText = `${job.title}\n${job.descriptionText}`;
  const fullSearchText = normalizeSearchText(fullText);
  const titleOverlap = profile.skills.filter((term) => containsProfileTerm(titleText, term));
  const profileTermOverlap = profile.skills.filter((term) => containsProfileTerm(fullSearchText, term));
  const matchedKeywords = profile.positiveKeywords.filter((term) =>
    containsProfileTerm(fullSearchText, term)
  );
  const missingMustHaveKeywords = profile.mustHaveKeywords.filter(
    (term) => !containsProfileTerm(fullSearchText, term)
  );
  const targetTitleMatch = profile.targetTitles.some((title) => titleContainsPhrase(titleNorm, title));
  const keywordTitleMatch = profile.positiveKeywords.some((keyword) =>
    titleContainsPhrase(titleNorm, keyword)
  );

  let score = 0;
  const signals: MatchSignal[] = [];

  if (roleFamilyFit) {
    score += 20;
    signals.push('role_family_fit');
  }

  if (targetTitleMatch) {
    score += 30;
    signals.push('target_title');
  } else if (keywordTitleMatch) {
    score += 20;
    signals.push('target_title');
  } else if (titleOverlap.length > 0) {
    score += Math.min(30, titleOverlap.length * 10);
    signals.push('profile_title_overlap');
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

  if (profile.seniority === 'new_grad' || profile.seniority === 'junior') {
    signals.push('seniority_fit');
  }

  if (softExperienceCap) {
    score -= 15;
    signals.push('years_soft_cap');
    signals.push('llm_review_recommended');
  }

  if (profileTermOverlap.length >= 2 || titleOverlap.length > 0) {
    score += 10;
    signals.push('description_evidence');
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    signals: uniqueSorted(signals) as MatchSignal[],
    matchedTitleTerms: titleOverlap,
    matchedKeywords,
    matchedSkills: profileTermOverlap,
    missingMustHaveKeywords
  };
}

export function prefilterJob(job: PrefilterJobInput, ctx: PrefilterContext): PrefilterResult {
  const reasons: PrefilterReason[] = [];

  const profile = normalizeMatchProfile(ctx);
  const titleReason = passesTitleFilter(job.title, profile);
  if (titleReason === 'title_negative') {
    reasons.push(titleReason);
  }

  const roleFamily = passesRoleFamilyFilter(job.title, profile);
  if (!roleFamily.pass) {
    reasons.push('role_family_mismatch');
  }

  if (!passesLocationFilter(job, ctx.preferredCountries)) {
    reasons.push('location');
  }

  const expReason = passesExperienceFilter(job.descriptionText, profile);
  const experiencePass = expReason == null;
  if (expReason) {
    reasons.push(expReason);
  }
  const softExperienceCap = hasSoftExperienceCap(job.descriptionText, profile);

  const seniorityReason = passesSeniorityTitleFilter(job.title, job.descriptionText, profile);
  if (seniorityReason) {
    reasons.push(seniorityReason);
  }

  const minYearsRequired = maxImpliedMinYears(job.descriptionText, { requiredOnly: true }) || null;
  const earlyCareerSignal = EARLY_CAREER_REGEX.test(`${job.title}\n${job.descriptionText}`);
  const scored = scoreJobMatch(
    job,
    ctx,
    experiencePass,
    roleFamily.explicitFit,
    softExperienceCap
  );
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
    signals: uniqueSorted(scored.signals) as MatchSignal[],
    audit: {
      matcherVersion: JOB_MATCHER_VERSION,
      decision: reasons.length === 0 ? 'pass' : 'reject',
      score: scored.score,
      reasons,
      signals: uniqueSorted(scored.signals) as MatchSignal[],
      roleFamily: {
        name: roleFamily.explicitFit ? 'engineering' : roleFamily.pass ? 'unknown' : 'wrong_role',
        matched: roleFamily.explicitFit
      },
      evidence: {
        matchedTitleTerms: scored.matchedTitleTerms,
        matchedKeywords: scored.matchedKeywords,
        matchedSkills: scored.matchedSkills,
        missingMustHaveKeywords: scored.missingMustHaveKeywords
      },
      seniority: {
        profile: profile.seniority,
        earlyCareerSignal,
        minYearsRequired,
        softExperienceCap
      },
      llm: {
        reviewed: false,
        pass: null,
        rationale: null,
        reasonCodes: []
      }
    }
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
