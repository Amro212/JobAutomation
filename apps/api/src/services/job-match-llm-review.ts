import {
  prefilterContextFromApplicant,
  prefilterJob,
  type ApplicantProfile,
  type JobRecord,
  type PrefilterAudit,
  type PrefilterReason
} from '@jobautomation/core';
import {
  createOpenRouterProvider,
  type GenerateStructuredObjectInput,
  type OpenRouterConfig
} from '@jobautomation/llm';

const llmMatchReviewJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['pass', 'score_delta', 'reason_codes', 'rationale'],
  properties: {
    pass: { type: 'boolean' },
    score_delta: { type: 'number' },
    reason_codes: { type: 'array', items: { type: 'string' } },
    rationale: { type: 'string' }
  }
} as const;

type ParsedLlmMatchReview = {
  pass: boolean;
  score_delta: number;
  reason_codes: string[];
  rationale: string;
};

export type JobMatchLlmReviewResult = {
  reviewed: boolean;
  pass: boolean;
  score: number;
  reasons: PrefilterReason[];
  audit: PrefilterAudit;
};

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function shouldReview(audit: PrefilterAudit): boolean {
  return audit.signals.includes('llm_review_recommended');
}

function parseLlmMatchReview(value: unknown): ParsedLlmMatchReview | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (typeof record.pass !== 'boolean') {
    return null;
  }

  const scoreDelta = typeof record.score_delta === 'number' ? Math.trunc(record.score_delta) : 0;
  return {
    pass: record.pass,
    score_delta: Math.max(-100, Math.min(100, scoreDelta)),
    reason_codes: Array.isArray(record.reason_codes)
      ? record.reason_codes.filter((entry): entry is string => typeof entry === 'string')
      : [],
    rationale: typeof record.rationale === 'string' ? record.rationale : ''
  };
}

function buildPrompt(job: JobRecord, profile: ApplicantProfile | null, audit: PrefilterAudit): string {
  return [
    '--- Deterministic match audit ---',
    JSON.stringify({
      decision: audit.decision,
      score: audit.score,
      reasons: audit.reasons,
      signals: audit.signals,
      roleFamily: audit.roleFamily,
      evidence: audit.evidence,
      seniority: audit.seniority
    }),
    '',
    '--- Applicant ---',
    `Seniority: ${profile?.jobKeywordProfile?.seniority ?? 'unknown'}`,
    `Summary: ${profile?.summary.trim() || '(none)'}`,
    `Context: ${profile?.reusableContext.trim() || '(none)'}`,
    `Target titles: ${(profile?.jobKeywordProfile?.target_titles ?? []).join(', ') || '(none)'}`,
    `Must-have keywords: ${(profile?.jobKeywordProfile?.must_have_keywords ?? []).join(', ') || '(none)'}`,
    '',
    '--- Job ---',
    `Company: ${job.companyName}`,
    `Title: ${job.title}`,
    `Location: ${job.location || 'Unspecified'}`,
    `Remote: ${job.remoteType}`,
    `Description: ${job.descriptionText.slice(0, 8000) || '(none)'}`
  ].join('\n');
}

export async function reviewJobMatchWithLlm(input: {
  job: JobRecord;
  applicantProfile: ApplicantProfile | null;
  openRouter?: OpenRouterConfig | null;
  provider?: {
    generateStructuredObject(input: GenerateStructuredObjectInput): Promise<unknown>;
  } | null;
}): Promise<JobMatchLlmReviewResult> {
  const deterministic = prefilterJob(
    input.job,
    prefilterContextFromApplicant(input.applicantProfile)
  );

  const provider =
    input.provider ??
    (input.openRouter?.apiKey ? createOpenRouterProvider(input.openRouter) : null);

  if (!deterministic.pass || !shouldReview(deterministic.audit) || !provider) {
    return {
      reviewed: false,
      pass: deterministic.pass,
      score: deterministic.score,
      reasons: deterministic.reasons,
      audit: deterministic.audit
    };
  }

  const structured = await provider.generateStructuredObject({
    schemaName: 'job_match_review',
    schema: llmMatchReviewJsonSchema as unknown as Record<string, unknown>,
    systemPrompt: [
      'You are a strict job-match reviewer for an autopilot job application system.',
      'Review only borderline/conflict cases already flagged by deterministic matching.',
      'The applicant is early-career unless the profile says otherwise.',
      'Veto wrong role families, over-level roles, business operations roles, and jobs where title fit is weak despite technical buzzwords.',
      'Pass strong software/automation/QA/SDET/frontend/backend/devtools/infrastructure engineering roles with plausible requirements.',
      'Return only the JSON object.'
    ].join('\n'),
    prompt: buildPrompt(input.job, input.applicantProfile, deterministic.audit)
  });

  const parsed = parseLlmMatchReview(structured);
  if (!parsed) {
    return {
      reviewed: false,
      pass: deterministic.pass,
      score: deterministic.score,
      reasons: deterministic.reasons,
      audit: deterministic.audit
    };
  }

  const score = clampScore(deterministic.score + parsed.score_delta);
  const reasons = parsed.pass
    ? deterministic.reasons
    : ([...deterministic.reasons, 'llm_veto'] as PrefilterReason[]);
  const audit: PrefilterAudit = {
    ...deterministic.audit,
    matcherVersion: deterministic.audit.matcherVersion,
    decision: parsed.pass ? deterministic.audit.decision : 'reject',
    score,
    reasons,
    llm: {
      reviewed: true,
      pass: parsed.pass,
      rationale: parsed.rationale,
      reasonCodes: parsed.reason_codes
    }
  };

  return {
    reviewed: true,
    pass: parsed.pass,
    score,
    reasons,
    audit
  };
}
