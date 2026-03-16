import { eq } from 'drizzle-orm';

import {
  discoveryScheduleRecordSchema,
  discoveryScheduleUpdateSchema,
  type DiscoveryScheduleRecord,
  type DiscoveryScheduleUpdate
} from '@jobautomation/core';

import type { JobAutomationDatabase } from '../client';
import { discoverySchedulesTable } from '../schema';

const DEFAULT_DISCOVERY_SCHEDULE_ID = 'default';

function mapDiscoverySchedule(
  record: typeof discoverySchedulesTable.$inferSelect
): DiscoveryScheduleRecord {
  return discoveryScheduleRecordSchema.parse(record);
}

export class DiscoverySchedulesRepository {
  constructor(private readonly db: JobAutomationDatabase) {}

  async get(): Promise<DiscoveryScheduleRecord | null> {
    const record = await this.db.query.discoverySchedulesTable.findFirst({
      where: eq(discoverySchedulesTable.id, DEFAULT_DISCOVERY_SCHEDULE_ID)
    });

    return record ? mapDiscoverySchedule(record) : null;
  }

  async upsert(input: DiscoveryScheduleUpdate): Promise<DiscoveryScheduleRecord> {
    const parsed = discoveryScheduleUpdateSchema.parse(input);
    const existing = await this.get();
    const now = new Date();
    const record = {
      id: DEFAULT_DISCOVERY_SCHEDULE_ID,
      cronExpression: parsed.cronExpression ?? existing?.cronExpression ?? '0 */6 * * *',
      timezone: parsed.timezone ?? existing?.timezone ?? 'America/Toronto',
      enabled: parsed.enabled ?? existing?.enabled ?? false,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };

    await this.db
      .insert(discoverySchedulesTable)
      .values(record)
      .onConflictDoUpdate({
        target: discoverySchedulesTable.id,
        set: {
          cronExpression: record.cronExpression,
          timezone: record.timezone,
          enabled: record.enabled,
          updatedAt: record.updatedAt
        }
      });

    return mapDiscoverySchedule(record);
  }
}