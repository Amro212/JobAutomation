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
import { createStructuredAiProvider } from './ai-provider';

export type GenerateArtifactsMode = 'both' | 'resume' | 'cover-letter';

export type ArtifactGenerationWarning = {
  stage: 'resume' | 'cover_letter';
  message: string;
};

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
  warningDetails?: ArtifactGenerationWarning[];
}> {
  const mode = input.mode ?? 'both';
  const job = await input.repositories.jobs.findById(input.jobId);
  if (!job) {
    throw new JobArtifactGenerationError('Job not found.', 404);
  }

  const profile = await input.repositories.applicantProfile.get();
  assertReadyForTailoring(profile);

  const openRouter = createStructuredAiProvider(input.config, {
    model: input.config.OPENROUTER_JOB_SUMMARY_MODEL
  });
  const allowStaticFallback = input.config.JOBAUTOMATION_ALLOW_STATIC_ARTIFACT_FALLBACK;
  if (!openRouter && !allowStaticFallback) {
    throw new JobArtifactGenerationError(
      'Sign in to enable hosted AI generation before generating artifacts.',
      409
    );
  }
  const outputRoot = resolveArtifactsOutputRoot(input.config);
  const generatedArtifacts: ArtifactRecord[] = [];
  const warnings: string[] = [];
  const warningDetails: ArtifactGenerationWarning[] = [];

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
      warningDetails.push({ stage: 'resume', message });
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
          coverLetterResumeIsTailoredVariant: coverLetterUsesTailoredResume,
          allowStaticFallback
        }))
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Cover letter generation failed.';
      warnings.push(`Cover letter: ${message}`);
      warningDetails.push({ stage: 'cover_letter', message });
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
    ...(warnings.length > 0
      ? {
          warnings,
          warningDetails
        }
      : {})
  };
}
