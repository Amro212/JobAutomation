import {
  artifactRecordSchema,
  applicantProfileSchema,
  jobRecordSchema
} from '@jobautomation/core';
import { createOpenRouterProvider, DEFAULT_OPENROUTER_JOB_SUMMARY_MODEL } from '@jobautomation/llm';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { generateCoverLetterVariant, generateResumeVariant } from '@jobautomation/documents';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';

type GenerateArtifactsMode = 'both' | 'resume' | 'cover-letter';

function parseGeneratePayload(body: unknown): { mode: GenerateArtifactsMode } {
  const mode =
    typeof body === 'object' && body !== null && typeof (body as { mode?: unknown }).mode === 'string'
      ? (body as { mode: string }).mode
      : 'both';

  if (mode !== 'both' && mode !== 'resume' && mode !== 'cover-letter') {
    throw new Error('mode must be one of both, resume, or cover-letter.');
  }

  return { mode };
}

function buildOpenRouterClient(
  app: Pick<FastifyInstance, 'config'>
): ReturnType<typeof createOpenRouterProvider> | null {
  if (!app.config.OPENROUTER_API_KEY) {
    return null;
  }

  return createOpenRouterProvider({
    apiKey: app.config.OPENROUTER_API_KEY,
    baseUrl: app.config.OPENROUTER_API_BASE_URL,
    model: app.config.OPENROUTER_JOB_SUMMARY_MODEL || DEFAULT_OPENROUTER_JOB_SUMMARY_MODEL
  });
}

export const registerArtifactsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/artifacts/:artifactId/file', async (request, reply) => {
    const { artifactId } = request.params as { artifactId: string };
    const { download } = request.query as { download?: string };
    const artifact = await app.repositories.artifacts.findById(artifactId);

    if (!artifact) {
      return reply.code(404).send({ message: 'Artifact not found.' });
    }

    if (!existsSync(artifact.storagePath)) {
      return reply.code(404).send({ message: 'Artifact file not found on disk.' });
    }

    const fileName = basename(artifact.fileName || artifact.storagePath);
    const contentType =
      artifact.format === 'pdf'
        ? 'application/pdf'
        : artifact.format === 'tex' || artifact.format === 'log'
          ? 'text/plain; charset=utf-8'
          : 'application/octet-stream';

    const content = await readFile(artifact.storagePath);

    reply
      .header('content-type', contentType)
      .header('content-disposition', `${download === '1' ? 'attachment' : 'inline'}; filename="${fileName}"`)
      .header('cache-control', 'no-store')
      .send(content);
  });

  app.get('/jobs/:jobId/artifacts', async (request, reply) => {
    const { jobId } = request.params as { jobId: string };
    const job = await app.repositories.jobs.findById(jobId);

    if (!job) {
      return reply.code(404).send({ message: 'Job not found.' });
    }

    const artifacts = await app.repositories.artifacts.listByJob(jobId);
    const profile = await app.repositories.applicantProfile.get();

    return {
      job: jobRecordSchema.parse(job),
      profile: profile ? applicantProfileSchema.parse(profile) : null,
      artifacts: artifacts.map((artifact) => artifactRecordSchema.parse(artifact))
    };
  });

  app.post('/jobs/:jobId/artifacts', async (request, reply) => {
    const { jobId } = request.params as { jobId: string };
    const { mode } = parseGeneratePayload(request.body);
    const job = await app.repositories.jobs.findById(jobId);

    if (!job) {
      return reply.code(404).send({ message: 'Job not found.' });
    }

    const profile = await app.repositories.applicantProfile.get();
    if (!profile || !profile.baseResumeTex.trim() || !profile.reusableContext.trim()) {
      return reply.code(409).send({
        message: 'Save the canonical LaTeX resume and reusable applicant context before generating artifacts.'
      });
    }

    const openRouter = buildOpenRouterClient(app);
    const generatedArtifacts: Array<{
      applicantProfileId: string | null;
      applicantProfileUpdatedAt: Date | null;
      createdAt: Date;
      discoveryRunId: string | null;
      fileName: string;
      format: string;
      id: string;
      jobId: string | null;
      kind: string;
      storagePath: string;
      version: number;
    }> = [];
    const errors: string[] = [];

    if (mode === 'both' || mode === 'resume') {
      try {
        generatedArtifacts.push(
          ...(await generateResumeVariant({
            job,
            applicantProfile: profile,
            artifactsRepository: app.repositories.artifacts,
            openRouter
          }))
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Resume generation failed.';
        app.log.error({ err: error, jobId }, 'Resume variant generation failed');
        errors.push(`Resume: ${message}`);
      }
    }

    if (mode === 'both' || mode === 'cover-letter') {
      try {
        generatedArtifacts.push(
          ...(await generateCoverLetterVariant({
            job,
            applicantProfile: profile,
            artifactsRepository: app.repositories.artifacts,
            openRouter
          }))
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Cover letter generation failed.';
        app.log.error({ err: error, jobId }, 'Cover letter variant generation failed');
        errors.push(`Cover letter: ${message}`);
      }
    }

    if (generatedArtifacts.length === 0 && errors.length > 0) {
      return reply.code(500).send({
        message: `Artifact generation failed: ${errors.join('; ')}`
      });
    }

    return {
      artifacts: generatedArtifacts.map((artifact) => artifactRecordSchema.parse(artifact)),
      warnings: errors.length > 0 ? errors : undefined
    };
  });
};
