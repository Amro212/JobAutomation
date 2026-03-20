import { randomUUID } from 'node:crypto';

import { and, desc, eq, max } from 'drizzle-orm';

import { artifactRecordSchema, type ArtifactRecord } from '@jobautomation/core';

import type { JobAutomationDatabase } from '../client';
import { artifactsTable } from '../schema';

export type CreateArtifactInput = Omit<
  ArtifactRecord,
  'id' | 'version' | 'applicantProfileId' | 'applicantProfileUpdatedAt'
> &
  Partial<Pick<ArtifactRecord, 'version' | 'applicantProfileId' | 'applicantProfileUpdatedAt'>> & {
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
      id: input.id ?? randomUUID(),
      version: input.version ?? 1,
      applicantProfileId: input.applicantProfileId ?? null,
      applicantProfileUpdatedAt: input.applicantProfileUpdatedAt ?? null
    };

    await this.db.insert(artifactsTable).values(record);

    return artifactRecordSchema.parse(record);
  }

  async findById(id: string): Promise<ArtifactRecord | null> {
    const [record] = await this.db.select().from(artifactsTable).where(eq(artifactsTable.id, id));

    return record ? mapArtifactRecord(record) : null;
  }

  async listByJob(jobId: string): Promise<ArtifactRecord[]> {
    const records = await this.db
      .select()
      .from(artifactsTable)
      .where(eq(artifactsTable.jobId, jobId))
      .orderBy(desc(artifactsTable.createdAt));

    return records.map(mapArtifactRecord);
  }

  async listByDiscoveryRun(discoveryRunId: string): Promise<ArtifactRecord[]> {
    const records = await this.db
      .select()
      .from(artifactsTable)
      .where(eq(artifactsTable.discoveryRunId, discoveryRunId))
      .orderBy(desc(artifactsTable.createdAt));

    return records.map(mapArtifactRecord);
  }

  async listByJobAndKind(jobId: string, kind: string): Promise<ArtifactRecord[]> {
    const records = await this.db
      .select()
      .from(artifactsTable)
      .where(and(eq(artifactsTable.jobId, jobId), eq(artifactsTable.kind, kind)))
      .orderBy(desc(artifactsTable.version), desc(artifactsTable.createdAt));

    return records.map(mapArtifactRecord);
  }

  async nextVersionForJobAndKind(jobId: string, kind: string): Promise<number> {
    const [record] = await this.db
      .select({
        version: max(artifactsTable.version)
      })
      .from(artifactsTable)
      .where(and(eq(artifactsTable.jobId, jobId), eq(artifactsTable.kind, kind)));

    return (record?.version ?? 0) + 1;
  }
}
