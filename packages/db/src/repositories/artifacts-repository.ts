import { randomUUID } from 'node:crypto';

import { desc, eq } from 'drizzle-orm';

import { artifactRecordSchema, type ArtifactRecord } from '@jobautomation/core';

import type { JobAutomationDatabase } from '../client';
import { artifactsTable } from '../schema';

export type CreateArtifactInput = Omit<ArtifactRecord, 'id'> & {
  id?: string;
};

function mapArtifactRecord(record: typeof artifactsTable.$inferSelect): ArtifactRecord {
  return artifactRecordSchema.parse(record);
}

export class ArtifactsRepository {
  constructor(private readonly db: JobAutomationDatabase) {}

  async create(input: CreateArtifactInput): Promise<ArtifactRecord> {
    const record = {
      ...input,
      id: input.id ?? randomUUID()
    };

    await this.db.insert(artifactsTable).values(record);

    return artifactRecordSchema.parse(record);
  }

  async listByJob(jobId: string): Promise<ArtifactRecord[]> {
    const records = await this.db
      .select()
      .from(artifactsTable)
      .where(eq(artifactsTable.jobId, jobId))
      .orderBy(desc(artifactsTable.createdAt));

    return records.map(mapArtifactRecord);
  }
}
