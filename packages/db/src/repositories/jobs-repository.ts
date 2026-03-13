import { randomUUID } from 'node:crypto';

import { and, desc, eq } from 'drizzle-orm';

import { jobRecordSchema, type JobRecord } from '@jobautomation/core';

import type { JobAutomationDatabase } from '../client';
import { jobsTable } from '../schema';

export type UpsertJobInput = Omit<JobRecord, 'id'> & {
  id?: string;
};

function mapJobRecord(record: typeof jobsTable.$inferSelect): JobRecord {
  return jobRecordSchema.parse(record);
}

export class JobsRepository {
  constructor(private readonly db: JobAutomationDatabase) {}

  async list(): Promise<JobRecord[]> {
    const records = await this.db.select().from(jobsTable).orderBy(desc(jobsTable.updatedAt));
    return records.map(mapJobRecord);
  }

  async findById(id: string): Promise<JobRecord | null> {
    const record = await this.db.query.jobsTable.findFirst({
      where: eq(jobsTable.id, id)
    });

    return record ? mapJobRecord(record) : null;
  }

  async findBySource(sourceKind: string, sourceId: string): Promise<JobRecord | null> {
    const record = await this.db.query.jobsTable.findFirst({
      where: and(eq(jobsTable.sourceKind, sourceKind), eq(jobsTable.sourceId, sourceId))
    });

    return record ? mapJobRecord(record) : null;
  }

  async upsert(input: UpsertJobInput): Promise<JobRecord> {
    const existing = await this.findBySource(input.sourceKind, input.sourceId);
    const recordId = existing?.id ?? input.id ?? randomUUID();

    await this.db
      .insert(jobsTable)
      .values({
        ...input,
        id: recordId
      })
      .onConflictDoUpdate({
        target: [jobsTable.sourceKind, jobsTable.sourceId],
        set: {
          sourceUrl: input.sourceUrl,
          companyName: input.companyName,
          title: input.title,
          location: input.location,
          remoteType: input.remoteType,
          employmentType: input.employmentType,
          compensationText: input.compensationText,
          descriptionText: input.descriptionText,
          rawPayload: input.rawPayload,
          discoveryRunId: input.discoveryRunId,
          status: input.status,
          discoveredAt: input.discoveredAt,
          updatedAt: input.updatedAt
        }
      });

    const persisted = await this.findById(recordId);
    if (!persisted) {
      throw new Error(`Persisted job ${recordId} was not found.`);
    }

    return persisted;
  }
}
