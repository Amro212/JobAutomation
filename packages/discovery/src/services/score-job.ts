import type { ApplicantProfile, JobRecord } from '@jobautomation/core';
import type { JobsRepository } from '@jobautomation/db';
import {
  createOpenRouterProvider,
  jobSummaryJsonSchema,
  jobSummarySchema,
  type OpenRouterConfig
} from '@jobautomation/llm';

export class JobScoreError extends Error {
  constructor(
    readonly code: 'invalid_output' | 'not_configured' | 'not_found' | 'provider_error',
    message: string
  ) {
    super(message);
    this.name = 'JobScoreError';
  }
}

/** Max LaTeX resume characters sent to the model (full source can be large). */
const RESUME_EXCERPT_MAX_CHARS = 12_000;

export type ScoreJobInput = {
  jobId: string;
  jobsRepository: JobsRepository;
  openRouter?: OpenRouterConfig;
  /** When present with non-empty scoring fields, the model judges fit for this applicant. */
  applicantProfile?: ApplicantProfile | null;
};

function applicantHasScoringContext(profile: ApplicantProfile | null | undefined): boolean {
  if (!profile) {
    return false;
  }

  const summary = profile.summary.trim();
  const context = profile.reusableContext.trim();
  const resume = profile.baseResumeTex.trim();

  return Boolean(summary || context || resume);
}

function excerptResumeTex(tex: string): string {
  const trimmed = tex.trim();

  if (trimmed.length <= RESUME_EXCERPT_MAX_CHARS) {
    return trimmed;
  }

  return `${trimmed.slice(0, RESUME_EXCERPT_MAX_CHARS)}\n\n[Resume excerpt truncated.]`;
}

function scoringSystemPrompt(personalized: boolean): string {
  if (personalized) {
    return [
      'You are a concise technical career advisor. The candidate saved their profile and base resume in Setup.',
      'Assess personalized fit: compare this single job posting to that one person—not a generic hire.',
      '',
      'Output rules (JSON schema enforced):',
      '- summary: 2–4 short sentences for shortlist triage; open with the fit verdict.',
      '- score: integer 0–100 = how strong a fit the role is for THIS person (skills, seniority, domain, scope, work mode). Ignore abstract prestige.',
      '- reasoning: tight prose naming specific overlaps and gaps; cite the posting and the applicant blocks below. No markdown lists.',
      '',
      'Return only the JSON object. No code fences or commentary.'
    ].join('\n');
  }

  return [
    'No applicant profile or resume text was provided (empty Setup).',
    'You cannot assess personal fit. Score and explain what is knowable from the posting alone.',
    '',
    'Output rules (JSON schema enforced):',
    '- summary: neutral read of the role as written.',
    '- score: integer 0–100 = posting clarity, scope, and plausibility for an experienced hire; penalize vagueness and red flags. Do not invent personal fit.',
    '- reasoning: state limits explicitly and suggest completing Setup for personalized fit scoring.',
    '',
    'Return only the JSON object. No code fences or commentary.'
  ].join('\n');
}

function buildPrompt(job: JobRecord, profile: ApplicantProfile | null | undefined): string {
  const jobLines = [
    '--- Job posting ---',
    `Company: ${job.companyName}`,
    `Title: ${job.title}`,
    `Location: ${job.location || 'Unspecified'}`,
    `Remote type: ${job.remoteType}`,
    `Employment type: ${job.employmentType ?? 'Unspecified'}`,
    `Compensation: ${job.compensationText ?? 'Unspecified'}`,
    `Reviewer notes (optional): ${job.reviewNotes || 'None'}`,
    '',
    'Description:',
    job.descriptionText || 'No description provided.'
  ];

  if (!applicantHasScoringContext(profile)) {
    return [...jobLines, '', '--- Applicant ---', 'No saved profile, summary, context, or resume text.'].join(
      '\n'
    );
  }

  const p = profile!;

  const applicantLines = [
    '',
    '--- Applicant (personalized fit) ---',
    `Name: ${p.fullName.trim() || 'Unspecified'}`,
    `Their location: ${p.location.trim() || 'Unspecified'}`,
    '',
    'Professional summary:',
    p.summary.trim() || '(none)',
    '',
    'Reusable context (cross-application notes):',
    p.reusableContext.trim() || '(none)',
    '',
    'Base resume (LaTeX source excerpt):',
    p.baseResumeTex.trim() ? excerptResumeTex(p.baseResumeTex) : '(none)'
  ];

  return [...jobLines, ...applicantLines].join('\n');
}

export async function scoreJob(input: ScoreJobInput): Promise<JobRecord> {
  if (!input.openRouter?.apiKey) {
    throw new JobScoreError(
      'not_configured',
      'OpenRouter is not configured, so summary scoring is unavailable.'
    );
  }

  const job = await input.jobsRepository.findById(input.jobId);

  if (!job) {
    throw new JobScoreError('not_found', 'Job not found.');
  }

  const personalized = applicantHasScoringContext(input.applicantProfile);
  const systemPrompt = scoringSystemPrompt(personalized);
  const prompt = buildPrompt(job, input.applicantProfile ?? null);

  try {
    const provider = createOpenRouterProvider(input.openRouter);
    const structured = await provider.generateStructuredObject({
      schemaName: 'job_summary',
      schema: jobSummaryJsonSchema,
      systemPrompt,
      prompt
    });

    const parsed = jobSummarySchema.safeParse(structured);

    if (!parsed.success) {
      throw new JobScoreError(
        'invalid_output',
        'OpenRouter returned invalid structured output for this job.'
      );
    }

    const updated = await input.jobsRepository.updateReview(job.id, {
      reviewSummary: parsed.data.summary,
      reviewScore: parsed.data.score,
      reviewScoreReasoning: parsed.data.reasoning,
      reviewScoreUpdatedAt: new Date()
    });

    if (!updated) {
      throw new JobScoreError('not_found', 'Job not found.');
    }

    return updated;
  } catch (error) {
    if (error instanceof JobScoreError) {
      throw error;
    }

    const message = error instanceof Error ? error.message : 'Unknown OpenRouter scoring error.';
    const normalizedMessage = message.toLowerCase();

    if (normalizedMessage.includes('(http 401)') || normalizedMessage.includes('unauthorized')) {
      throw new JobScoreError(
        'not_configured',
        'OpenRouter authentication failed. Check OPENROUTER_API_KEY and retry.'
      );
    }

    if (normalizedMessage.includes('(http 402)')) {
      throw new JobScoreError(
        'not_configured',
        'OpenRouter or the model provider requires payment or credits. Add billing or top up on OpenRouter.'
      );
    }

    if (normalizedMessage.includes('invalid')) {
      throw new JobScoreError('invalid_output', message);
    }

    throw new JobScoreError('provider_error', message);
  }
}
