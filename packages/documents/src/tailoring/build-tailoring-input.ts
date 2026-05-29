import type { ApplicantProfile, JobRecord } from '@jobautomation/core';
import { toPlainJobDescription } from '@jobautomation/llm';

import { formatApplicantContext } from './load-applicant-context';

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
  'other',
  'class',
  'span',
  'strong',
  'content',
  'benefits',
  'welcome',
  'everyone',
  'div',
  'systems',
  'system',
  'build',
  'use',
  'lead',
  'responsibilities',
  'requirements',
  'qualifications',
  'preferred',
  'required'
]);

const PRIORITY_TERMS = [
  'front-end',
  'back-end',
  'full-stack',
  'typescript',
  'javascript',
  'react',
  'next.js',
  'node',
  'python',
  'sql',
  'aws',
  'gcp',
  'azure',
  'kubernetes',
  'docker',
  'terraform',
  'ci/cd',
  'git',
  'api',
  'graphql',
  'rest',
  'testing',
  'automation',
  'playwright',
  'cypress',
  'jest',
  'vitest',
  'machine learning',
  'ml',
  'ai',
  'llm',
  'distributed',
  'microservices',
  'security',
  'cyber',
  'threat',
  'intelligence',
  'evaluation',
  'infrastructure',
  'robotics',
  'autonomous',
  'latency',
  'scalability',
  'observability',
  'analytics',
  'fraud',
  'etl',
  'spark',
  'dbt',
  'airflow',
  'snowflake'
];

function extractResumeBullets(baseResumeTex: string): string[] {
  const bullets = baseResumeTex.match(/\\item\s+[^\n]+/g) ?? [];
  return bullets.map((bullet) => bullet.replace(/^\\item\s+/, '').trim());
}

function normalizeKeywordText(text: string): string {
  return text
    .toLowerCase()
    .replace(/front\s+end/g, 'front-end')
    .replace(/back\s+end/g, 'back-end')
    .replace(/full\s+stack/g, 'full-stack')
    .replace(/[^a-z0-9+#./\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function appendUnique(target: string[], term: string): void {
  if (!target.includes(term)) {
    target.push(term);
  }
}

function extractKeywords(text: string): string[] {
  const normalizedText = normalizeKeywordText(text);
  const keywords: string[] = [];

  for (const term of PRIORITY_TERMS) {
    if (normalizedText.includes(term)) {
      appendUnique(keywords, term);
    }
  }

  const words = normalizedText
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word));

  for (const word of words) {
    appendUnique(keywords, word);
    if (keywords.length >= 24) {
      break;
    }
  }

  return keywords.slice(0, 24);
}

export function buildTailoringInput(input: {
  job: JobRecord;
  applicantProfile: ApplicantProfile;
}): TailoringInput {
  const applicantContext = formatApplicantContext(input.applicantProfile);
  const resumeBullets = extractResumeBullets(input.applicantProfile.baseResumeTex);
  const plainDescription = toPlainJobDescription(input.job.descriptionText);
  const jobKeywords = extractKeywords(
    [
      input.job.title,
      input.job.companyName,
      input.job.location,
      plainDescription
    ]
      .filter((value) => value.length > 0)
      .join(' ')
  );

  return {
    job: input.job,
    applicantProfile: input.applicantProfile,
    baseResumeTex: input.applicantProfile.baseResumeTex,
    baseResumeFileName: input.applicantProfile.baseResumeFileName,
    applicantContext,
    jobKeywords,
    resumeBullets
  };
}
