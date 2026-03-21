import type { ApplicantProfile, JobKeywordProfile } from '@jobautomation/core';
import { jobKeywordProfileSchema } from '@jobautomation/core';
import { createOpenRouterProvider, jobKeywordProfileJsonSchema, type OpenRouterConfig } from '@jobautomation/llm';

export class JobKeywordProfileError extends Error {
  constructor(
    readonly code: 'not_configured' | 'insufficient_context' | 'invalid_output' | 'provider_error',
    message: string
  ) {
    super(message);
    this.name = 'JobKeywordProfileError';
  }
}

const RESUME_EXCERPT_MAX_CHARS = 12_000;

function excerptResumeTex(tex: string): string {
  const trimmed = tex.trim();
  if (trimmed.length <= RESUME_EXCERPT_MAX_CHARS) {
    return trimmed;
  }
  return `${trimmed.slice(0, RESUME_EXCERPT_MAX_CHARS)}\n\n[Resume excerpt truncated.]`;
}

function buildPrompt(profile: ApplicantProfile): string {
  const blocks = [
    '--- Applicant summary ---',
    profile.summary.trim() || '(none)',
    '',
    '--- Reusable context ---',
    profile.reusableContext.trim() || '(none)',
    '',
    '--- Base resume (LaTeX excerpt) ---',
    profile.baseResumeTex.trim() ? excerptResumeTex(profile.baseResumeTex) : '(none)'
  ];
  return blocks.join('\n');
}

function hasGenerationContext(profile: ApplicantProfile): boolean {
  return Boolean(
    profile.summary.trim() || profile.reusableContext.trim() || profile.baseResumeTex.trim()
  );
}

export type GenerateJobKeywordProfileInput = {
  applicantProfile: ApplicantProfile;
  openRouter: OpenRouterConfig;
};

export async function generateJobKeywordProfile(
  input: GenerateJobKeywordProfileInput
): Promise<JobKeywordProfile> {
  if (!input.openRouter?.apiKey?.trim()) {
    throw new JobKeywordProfileError(
      'not_configured',
      'OpenRouter is not configured, so job keyword profile generation is unavailable.'
    );
  }

  if (!hasGenerationContext(input.applicantProfile)) {
    throw new JobKeywordProfileError(
      'insufficient_context',
      'Add a summary, reusable context, or base resume before generating a job filter profile.'
    );
  }

  const systemPrompt = [
    'You extract a job-search filter profile for ONE applicant from their resume and notes.',
    'Maximize recall while keeping entries useful for FAST substring filtering (avoid weak or generic terms).',
    'Prefer breadth over minimal lists. Use short lowercase phrases suitable for matching job titles and descriptions.',
    'Rules:',
    '- target_titles: include ALL plausible job-title phrases with synonyms, variations, abbreviations, and stack-specific versions (e.g. software engineer, software developer, backend engineer, ml engineer, machine learning engineer, embedded engineer, firmware engineer, systems engineer).',
    '- positive_keywords: include ONLY strong, concrete signals such as programming languages, tools, frameworks, technologies, and domains. Include abbreviations and variants (e.g. javascript, js, node, nodejs, c++, cpp). DO NOT include soft skills (e.g. teamwork, communication).',
    '- negative_keywords: include title-level terms that indicate poor fit. Focus on roles, not skills (e.g. sales, recruiter, nurse, attorney, accountant, marketing, hr, customer support if not relevant).',
    '- seniority: one of new_grad, junior, mid, senior, lead — match how they present on the resume.',
    'Constraints:',
    '- Every entry must be useful for substring filtering.',
    '- Avoid duplicates.',
    '- No explanations or extra text.',
    'Return only the JSON object. No commentary.'
  ].join('\\n');

  const prompt = buildPrompt(input.applicantProfile);

  try {
    const provider = createOpenRouterProvider(input.openRouter);
    const structured = await provider.generateStructuredObject({
      schemaName: 'job_keyword_profile',
      schema: jobKeywordProfileJsonSchema as unknown as Record<string, unknown>,
      systemPrompt,
      prompt
    });

    const parsed = jobKeywordProfileSchema.safeParse(structured);
    if (!parsed.success) {
      throw new JobKeywordProfileError(
        'invalid_output',
        'OpenRouter returned invalid structured output for the job keyword profile.'
      );
    }

    return parsed.data;
  } catch (error) {
    if (error instanceof JobKeywordProfileError) {
      throw error;
    }
    throw new JobKeywordProfileError(
      'provider_error',
      error instanceof Error ? error.message : 'OpenRouter request failed.'
    );
  }
}
