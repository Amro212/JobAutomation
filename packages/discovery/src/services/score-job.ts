import type { JobRecord } from '@jobautomation/core';
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

export type ScoreJobInput = {
  jobId: string;
  jobsRepository: JobsRepository;
  openRouter?: OpenRouterConfig;
};

function buildPrompt(job: JobRecord): string {
  return [
    'Score this job for shortlist triage.',
    '',
    `Company: ${job.companyName}`,
    `Title: ${job.title}`,
    `Location: ${job.location || 'Unspecified'}`,
    `Remote type: ${job.remoteType}`,
    `Employment type: ${job.employmentType ?? 'Unspecified'}`,
    `Compensation: ${job.compensationText ?? 'Unspecified'}`,
    `Existing review notes: ${job.reviewNotes || 'None'}`,
    '',
    'Description:',
    job.descriptionText || 'No description provided.'
  ].join('\n');
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

  try {
    const provider = createOpenRouterProvider(input.openRouter);
    const structured = await provider.generateStructuredObject({
      schemaName: 'job_summary',
      schema: jobSummaryJsonSchema,
      systemPrompt:
        'You summarize discovered jobs for shortlist triage. Return only the requested JSON object.',
      prompt: buildPrompt(job)
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

    if (message.toLowerCase().includes('invalid')) {
      throw new JobScoreError('invalid_output', message);
    }

    throw new JobScoreError('provider_error', message);
  }
}
