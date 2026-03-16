import { randomUUID } from 'node:crypto';

import { asc, eq } from 'drizzle-orm';

import { logEventRecordSchema, type LogEventRecord, type LogLevel } from '@jobautomation/core';

import type { JobAutomationDatabase } from '../client';
import { logEventsTable } from '../schema';

export type CreateLogEventInput = {
  discoveryRunId?: string | null;
  jobId?: string | null;
  level: LogLevel;
  message: string;
  detailsJson?: string | null;
  createdAt?: Date;
};

function mapLogEvent(record: typeof logEventsTable.$inferSelect): LogEventRecord {
  return logEventRecordSchema.parse(record);
}

export class LogEventsRepository {
  constructor(private readonly db: JobAutomationDatabase) {}

  async create(input: CreateLogEventInput): Promise<LogEventRecord> {
    const record = {
      id: randomUUID(),
      discoveryRunId: input.discoveryRunId ?? null,
      jobId: input.jobId ?? null,
      level: input.level,
      message: input.message,
      detailsJson: input.detailsJson ?? null,
      createdAt: input.createdAt ?? new Date()
    };

    await this.db.insert(logEventsTable).values(record);
    return mapLogEvent(record);
  }

  async listByDiscoveryRun(discoveryRunId: string): Promise<LogEventRecord[]> {
    const records = await this.db
      .select()
      .from(logEventsTable)
      .where(eq(logEventsTable.discoveryRunId, discoveryRunId))
      .orderBy(asc(logEventsTable.createdAt));

    return records.map(mapLogEvent);
  }
}