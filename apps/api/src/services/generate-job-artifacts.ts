import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import type { ArtifactRecord, ApplicantProfile, JobRecord } from '@jobautomation/core';
import type { AppEnv } from '@jobautomation/config';
import {
  type ApplicantProfileRepository,
  type ArtifactsRepository,
  type JobsRepository
} from '@jobautomation/db';
import {
  generateCoverLetterVariant,
  generateResumeVariant
} from '@jobautomation/documents';
import { createOpenRouterProvider } from '@jobautomation/llm';

export type GenerateArtifactsMode = 'both' | 'resume' | 'cover-letter';

export class JobArtifactGenerationError extends Error {
  constructor(
    message: string,
    readonly statusCode: number
  ) {
    super(message);
    this.name = 'JobArtifactGenerationError';
  }
}

type GenerateJobArtifactsInput = {
  jobId: string;
  mode?: GenerateArtifactsMode;
  repositories: {
    applicantProfile: ApplicantProfileRepository;
    artifacts: ArtifactsRepository;
    jobs: JobsRepository;
  };
  config: AppEnv;
};

function buildOpenRouterClient(config: AppEnv) {
  if (!config.OPENROUTER_API_KEY || !config.OPENROUTER_JOB_SUMMARY_MODEL) {
    return null;
  }

  return createOpenRouterProvider({
    apiKey: config.OPENROUTER_API_KEY,
    baseUrl: config.OPENROUTER_API_BASE_URL,
    model: config.OPENROUTER_JOB_SUMMARY_MODEL
  });
}

function assertReadyForTailoring(
  profile: ApplicantProfile | null
): asserts profile is ApplicantProfile {
  if (!profile || !profile.baseResumeTex.trim() || !profile.reusableContext.trim()) {
    throw new JobArtifactGenerationError(
      'Save the canonical LaTeX resume and reusable applicant context before generating artifacts.',
      409
    );
  }
}

async function readResumeVariantTexFromArtifacts(
  artifacts: ArtifactRecord[]
): Promise<string | null> {
  const texArtifact = artifacts.find(
    (artifact) => artifact.kind === 'resume-variant' && artifact.format === 'tex'
  );
  if (!texArtifact || !existsSync(texArtifact.storagePath)) {
    return null;
  }

  return readFile(texArtifact.storagePath, 'utf8');
}

async function readLatestResumeVariantTexForJob(
  jobId: string,
  artifactsRepository: ArtifactsRepository
): Promise<string | null> {
  const rows = await artifactsRepository.listByJobAndKind(jobId, 'resume-variant');
  const texArtifact = rows.find((artifact) => artifact.format === 'tex');
  if (!texArtifact || !existsSync(texArtifact.storagePath)) {
    return null;
  }

  return readFile(texArtifact.storagePath, 'utf8');
}

function resolveArtifactsOutputRoot(config: AppEnv): string {
  return join(dirname(config.JOB_AUTOMATION_DB_PATH), 'generated-artifacts');
}

export async function generateJobArtifactsForJob(
  input: GenerateJobArtifactsInput
): Promise<{
  job: JobRecord;
  profile: ApplicantProfile;
  artifacts: ArtifactRecord[];
  warnings?: string[];
}> {
  const mode = input.mode ?? 'both';
  const job = await input.repositories.jobs.findById(input.jobId);
  if (!job) {
    throw new JobArtifactGenerationError('Job not found.', 404);
  }

  const profile = await input.repositories.applicantProfile.get();
  assertReadyForTailoring(profile);

  const openRouter = buildOpenRouterClient(input.config);
  const outputRoot = resolveArtifactsOutputRoot(input.config);
  const generatedArtifacts: ArtifactRecord[] = [];
  const warnings: string[] = [];

  let resumeTexForCoverLetter: string | null = null;
  let coverLetterUsesTailoredResume = false;

  if (mode === 'both' || mode === 'resume') {
    try {
      const resumeArtifacts = await generateResumeVariant({
        job,
        applicantProfile: profile,
        artifactsRepository: input.repositories.artifacts,
        openRouter,
        outputRoot
      });
      generatedArtifacts.push(...resumeArtifacts);

      if (mode === 'both') {
        const tex = await readResumeVariantTexFromArtifacts(resumeArtifacts);
        if (tex) {
          resumeTexForCoverLetter = tex;
          coverLetterUsesTailoredResume = true;
        }
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Resume generation failed.';
      warnings.push(`Resume: ${message}`);
    }
  }

  if (mode === 'both' || mode === 'cover-letter') {
    if (mode === 'cover-letter') {
      const tex = await readLatestResumeVariantTexForJob(
        job.id,
        input.repositories.artifacts
      );
      if (tex) {
        resumeTexForCoverLetter = tex;
        coverLetterUsesTailoredResume = true;
      }
    }

    try {
      generatedArtifacts.push(
        ...(await generateCoverLetterVariant({
          job,
          applicantProfile: profile,
          artifactsRepository: input.repositories.artifacts,
          openRouter,
          outputRoot,
          resumeTexForCoverLetter,
          coverLetterResumeIsTailoredVariant: coverLetterUsesTailoredResume
        }))
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Cover letter generation failed.';
      warnings.push(`Cover letter: ${message}`);
    }
  }

  if (generatedArtifacts.length === 0 && warnings.length > 0) {
    throw new JobArtifactGenerationError(
      `Artifact generation failed: ${warnings.join('; ')}`,
      500
    );
  }

  return {
    job,
    profile,
    artifacts: generatedArtifacts,
    ...(warnings.length > 0 ? { warnings } : {})
  };
}
