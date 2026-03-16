import { randomUUID } from 'node:crypto';

import { desc, eq } from 'drizzle-orm';

import {
  discoveryRunRecordSchema,
  type DiscoveryRunKind,
  type DiscoveryRunRecord,
  type DiscoveryRunStatus,
  type DiscoveryRunTriggerKind
} from '@jobautomation/core';

import type { JobAutomationDatabase } from '../client';
import { discoveryRunsTable } from '../schema';

export type CreateDiscoveryRunInput = {
  sourceKind: string;
  runKind?: DiscoveryRunKind;
  triggerKind?: DiscoveryRunTriggerKind;
  discoverySourceId?: string | null;
  scheduleId?: string | null;
  status?: DiscoveryRunStatus;
};

function mapDiscoveryRun(record: typeof discoveryRunsTable.$inferSelect): DiscoveryRunRecord {
  return discoveryRunRecordSchema.parse(record);
}

export class DiscoveryRunsRepository {
  constructor(private readonly db: JobAutomationDatabase) {}

  async list(): Promise<DiscoveryRunRecord[]> {
    const records = await this.db
      .select()
      .from(discoveryRunsTable)
      .orderBy(desc(discoveryRunsTable.startedAt));

    return records.map(mapDiscoveryRun);
  }

  async findById(id: string): Promise<DiscoveryRunRecord | null> {
    const record = await this.db.query.discoveryRunsTable.findFirst({
      where: eq(discoveryRunsTable.id, id)
    });

    return record ? mapDiscoveryRun(record) : null;
  }

  async create(input: string | CreateDiscoveryRunInput): Promise<DiscoveryRunRecord> {
    const parsed = typeof input === 'string' ? { sourceKind: input } : input;
    const record = {
      id: randomUUID(),
      sourceKind: parsed.sourceKind,
      runKind: parsed.runKind ?? 'single-source',
      triggerKind: parsed.triggerKind ?? 'manual',
      discoverySourceId: parsed.discoverySourceId ?? null,
      scheduleId: parsed.scheduleId ?? null,
      status: parsed.status ?? ('running' as const),
      startedAt: new Date(),
      completedAt: null,
      jobCount: 0,
      newJobCount: 0,
      updatedJobCount: 0,
      errorMessage: null
    };

    await this.db.insert(discoveryRunsTable).values(record);
    return discoveryRunRecordSchema.parse(record);
  }

  async markRunning(id: string): Promise<DiscoveryRunRecord> {
    await this.db
      .update(discoveryRunsTable)
      .set({
        status: 'running',
        errorMessage: null
      })
      .where(eq(discoveryRunsTable.id, id));

    const record = await this.findById(id);
    if (!record) {
      throw new Error(`Discovery run ${id} was not found.`);
    }

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

    const record = await this.findById(args.id);

    if (!record) {
      throw new Error(`Discovery run ${args.id} was not found.`);
    }

    return record;
  }
}