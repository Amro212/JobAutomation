import {
  discoveryScheduleRecordSchema,
  discoveryScheduleUpdateSchema
} from '@jobautomation/core';
import type { FastifyPluginAsync } from 'fastify';

export const registerDiscoveryScheduleRoutes: FastifyPluginAsync = async (app) => {
  app.get('/discovery-schedules', async () => {
    const schedule = await app.discoveryScheduler.getSchedule();
    return {
      schedule: discoveryScheduleRecordSchema.parse(schedule)
    };
  });

  app.put('/discovery-schedules', async (request) => {
    const schedule = await app.discoveryScheduler.updateSchedule(
      discoveryScheduleUpdateSchema.parse(request.body ?? {})
    );

    return {
      schedule: discoveryScheduleRecordSchema.parse(schedule)
    };
  });
};
