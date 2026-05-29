import {
  autopilotConfigInputSchema,
  autopilotSettingsRecordSchema
} from '@jobautomation/core';
import type { FastifyPluginAsync } from 'fastify';

export const registerAutopilotSettingsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/autopilot-settings', async () => {
    const settings = await app.repositories.autopilotSettings.getOrCreateDefault();
    return {
      settings: autopilotSettingsRecordSchema.parse(settings)
    };
  });

  app.put('/autopilot-settings', async (request) => {
    const settings = await app.repositories.autopilotSettings.upsert(
      autopilotConfigInputSchema.parse(request.body ?? {})
    );
    return {
      settings: autopilotSettingsRecordSchema.parse(settings)
    };
  });
};
