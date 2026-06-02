import type { ApplicantProfile, JobKeywordProfile } from '@jobautomation/core';
import { jobKeywordProfileSchema } from '@jobautomation/core';
import {
  createOpenRouterProvider,
  jobKeywordProfileJsonSchema,
  type GenerateStructuredObjectInput,
  type OpenRouterConfig
} from '@jobautomation/llm';

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
  openRouter?: OpenRouterConfig | null;
  provider?: {
    generateStructuredObject(input: GenerateStructuredObjectInput): Promise<unknown>;
  } | null;
};

export async function generateJobKeywordProfile(
  input: GenerateJobKeywordProfileInput
): Promise<JobKeywordProfile> {
  const provider =
    input.provider ??
    (input.openRouter?.apiKey?.trim() ? createOpenRouterProvider(input.openRouter) : null);

  if (!provider) {
    throw new JobKeywordProfileError(
      'not_configured',
      'Hosted AI generation is not configured, so job keyword profile generation is unavailable.'
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
    'Build a balanced recall filter that finds many credible jobs the applicant could reasonably qualify for.',
    'Use short lowercase phrases suitable for deterministic substring filtering.',
    'Rules:',
    '- target_titles: include 15-30 realistic next-step and adjacent job-title phrases for this applicant, seniority-aware and grounded in the profile. Include synonyms, spelling variants, and credible adjacent engineering roles.',
    '- positive_keywords: include 35-70 profile-defining and adjacent credible skills, tools, frameworks, technologies, domains, abbreviations, and spelling variants. Include generic tools only when they materially improve recall for credible engineering jobs. DO NOT include soft skills (e.g. teamwork, communication).',
    '- negative_keywords: include title-level terms that indicate poor fit. For new_grad or junior profiles, include over-level terms such as senior, staff, principal, lead, manager, architect unless the profile clearly targets those roles. Also include unrelated role terms such as sales, recruiter, nurse, attorney, accountant, marketing, hr, customer support if not relevant.',
    '- seniority: one of new_grad, junior, mid, senior, lead — match how they present on the resume.',
    '- allowed_role_families: use ["engineering"] for software, automation, QA/SDET, frontend, backend, devtools, infrastructure, and implementation-heavy AI roles.',
    '- must_have_keywords: include 8-15 core skills/domains that strong matches should usually show, while avoiding terms so narrow that they hide credible adjacent roles.',
    '- nice_to_have_keywords: include 20-40 useful supporting skills, stack variants, domains, and adjacent technologies that improve rank but should not be mandatory.',
    '- negative_role_terms: wrong-track title/role terms such as revenue operations, GTM, sales ops, people ops, office/admin, compliance/officer, coordinator, COO/executive, generic analyst/support unless explicitly engineering-family.',
    '- max_required_years: for new_grad use 3 for soft-cap matching unless the profile clearly has more professional experience; otherwise null.',
    'Constraints:',
    '- Every entry must be useful for substring filtering.',
    '- Do not invent unsupported skills, domains, seniority, or role families. Broader recall must still be credible from the applicant profile.',
    '- Avoid duplicates.',
    '- No explanations or extra text.',
    'Return only the JSON object. No commentary.'
  ].join('\\n');

  const prompt = buildPrompt(input.applicantProfile);

  try {
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
