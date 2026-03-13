import { randomUUID } from 'node:crypto';

import { desc, eq } from 'drizzle-orm';

import type { DiscoveryRunStatus } from '@jobautomation/core';

import type { JobAutomationDatabase } from '../client';
import { discoveryRunsTable } from '../schema';

export type DiscoveryRunRecord = typeof discoveryRunsTable.$inferSelect;

export class DiscoveryRunsRepository {
  constructor(private readonly db: JobAutomationDatabase) {}

  async list(): Promise<DiscoveryRunRecord[]> {
    return this.db
      .select()
      .from(discoveryRunsTable)
      .orderBy(desc(discoveryRunsTable.startedAt));
  }

  async create(sourceKind: string): Promise<DiscoveryRunRecord> {
    const record: DiscoveryRunRecord = {
      id: randomUUID(),
      sourceKind,
      status: 'running',
      startedAt: new Date(),
      completedAt: null,
      jobCount: 0,
      newJobCount: 0,
      updatedJobCount: 0,
      errorMessage: null
    };

    await this.db.insert(discoveryRunsTable).values(record);
    return record;
  }

  async markFinished(args: {
    id: string;
    status: DiscoveryRunStatus;
    jobCount: number;
    newJobCount: number;
    updatedJobCount: number;
    errorMessage?: string | null;
  }): Promise<DiscoveryRunRecord> {
    await this.db
      .update(discoveryRunsTable)
      .set({
        status: args.status,
        jobCount: args.jobCount,
        newJobCount: args.newJobCount,
        updatedJobCount: args.updatedJobCount,
        errorMessage: args.errorMessage ?? null,
        completedAt: new Date()
      })
      .where(eq(discoveryRunsTable.id, args.id));

    const record = await this.db.query.discoveryRunsTable.findFirst({
      where: eq(discoveryRunsTable.id, args.id)
    });

    if (!record) {
      throw new Error(`Discovery run ${args.id} was not found.`);
    }

    return record;
  }
}
