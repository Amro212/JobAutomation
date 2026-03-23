import type { ApplicantProfile, JobRecord } from '@jobautomation/core';

export type TailoringInput = {
  job: JobRecord;
  applicantProfile: ApplicantProfile;
  baseResumeTex: string;
  baseResumeFileName: string;
  applicantContext: string;
  jobKeywords: string[];
  resumeBullets: string[];
};

const STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'from',
  'that',
  'this',
  'into',
  'your',
  'about',
  'role',
  'team',
  'work',
  'job',
  'resume',
  'experience',
  'company',
  'you',
  'our',
  'are',
  'will',
  'has',
  'have',
  'all',
  'not',
  'may',
  'can',
  'any',
  'per',
  'including',
  'such',
  'more',
  'most',
  'other'
]);

function extractResumeBullets(baseResumeTex: string): string[] {
  const bullets = baseResumeTex.match(/\\item\s+[^\n]+/g) ?? [];
  return bullets.map((bullet) => bullet.replace(/^\\item\s+/, '').trim());
}

function extractKeywords(text: string): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word));

  return Array.from(new Set(words)).slice(0, 24);
}

export function buildTailoringInput(input: {
  job: JobRecord;
  applicantProfile: ApplicantProfile;
}): TailoringInput {
  const resumeBullets = extractResumeBullets(input.applicantProfile.baseResumeTex);
  const jobKeywords = extractKeywords(
    [
      input.job.title,
      input.job.companyName,
      input.job.location,
      input.job.descriptionText,
      input.applicantProfile.summary,
      input.applicantProfile.reusableContext
    ]
      .filter((value) => value.length > 0)
      .join(' ')
  );

  return {
    job: input.job,
    applicantProfile: input.applicantProfile,
    baseResumeTex: input.applicantProfile.baseResumeTex,
    baseResumeFileName: input.applicantProfile.baseResumeFileName,
    applicantContext: input.applicantProfile.reusableContext,
    jobKeywords,
    resumeBullets
  };
}
