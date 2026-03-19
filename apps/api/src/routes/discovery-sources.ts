import {
  discoverySourceInputSchema,
  discoverySourcePatchSchema,
  discoverySourceRecordSchema
} from '@jobautomation/core';
import { normalizeDiscoverySourceInput } from '@jobautomation/discovery';
import type { FastifyPluginAsync } from 'fastify';

function toBadRequestMessage(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    error.name === 'ZodError' &&
    'issues' in error &&
    Array.isArray(error.issues)
  ) {
    const [firstIssue] = error.issues as Array<{ message?: string }>;
    return firstIssue?.message ?? 'Invalid discovery source payload.';
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Invalid discovery source payload.';
}

export const registerDiscoverySourceRoutes: FastifyPluginAsync = async (app) => {
  app.get('/discovery-sources', async () => {
    const sources = await app.repositories.discoverySources.list();
    return {
      sources: sources.map((source) => discoverySourceRecordSchema.parse(source))
    };
  });

  app.post('/discovery-sources', async (request, reply) => {
    try {
      const payload = normalizeDiscoverySourceInput(
        discoverySourceInputSchema.parse(request.body ?? {})
      );
      const source = await app.repositories.discoverySources.upsert(payload);

      return {
        source: discoverySourceRecordSchema.parse(source)
      };
    } catch (error) {
      return reply.code(400).send({ message: toBadRequestMessage(error) });
    }
  });

  app.patch('/discovery-sources/:sourceId', async (request, reply) => {
    const { sourceId } = request.params as { sourceId: string };
    const payload = discoverySourcePatchSchema.parse(request.body ?? {});
    const source = await app.repositories.discoverySources.update(sourceId, payload);

    if (!source) {
      return reply.code(404).send({ message: 'Discovery source not found.' });
    }

    return {
      source: discoverySourceRecordSchema.parse(source)
    };
  });
};
