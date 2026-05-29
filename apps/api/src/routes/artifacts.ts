import {
  artifactRecordSchema,
  applicantProfileSchema,
  jobRecordSchema
} from '@jobautomation/core';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import type { FastifyPluginAsync } from 'fastify';

import {
  generateJobArtifactsForJob,
  JobArtifactGenerationError,
  type GenerateArtifactsMode
} from '../services/generate-job-artifacts';

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

    try {
      const result = await generateJobArtifactsForJob({
        jobId,
        mode,
        repositories: {
          applicantProfile: app.repositories.applicantProfile,
          artifacts: app.repositories.artifacts,
          jobs: app.repositories.jobs
        },
        config: app.config
      });

      return {
        artifacts: result.artifacts.map((artifact) =>
          artifactRecordSchema.parse(artifact)
        ),
        warnings: result.warnings
      };
    } catch (error) {
      if (error instanceof JobArtifactGenerationError) {
        return reply.code(error.statusCode).send({ message: error.message });
      }

      throw error;
    }
  });
};
