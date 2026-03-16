import {
  discoverySourceInputSchema,
  discoverySourcePatchSchema,
  discoverySourceRecordSchema
} from '@jobautomation/core';
import { normalizeDiscoverySourceInput } from '@jobautomation/discovery';
import type { FastifyPluginAsync } from 'fastify';

export const registerDiscoverySourceRoutes: FastifyPluginAsync = async (app) => {
  app.get('/discovery-sources', async () => {
    const sources = await app.repositories.discoverySources.list();
    return {
      sources: sources.map((source) => discoverySourceRecordSchema.parse(source))
    };
  });

  app.post('/discovery-sources', async (request) => {
    const payload = normalizeDiscoverySourceInput(
      discoverySourceInputSchema.parse(request.body ?? {})
    );
    const source = await app.repositories.discoverySources.upsert(payload);

    return {
      source: discoverySourceRecordSchema.parse(source)
    };
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
