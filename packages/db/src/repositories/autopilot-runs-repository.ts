import { randomUUID } from 'node:crypto';

import { desc, eq } from 'drizzle-orm';

import {
  autopilotRunRecordSchema,
  type AutopilotRunRecord,
  type AutopilotRunStatus,
  type AutopilotRunTriggerKind
} from '@jobautomation/core';

import type { JobAutomationDatabase } from '../client';
import { autopilotRunsTable } from '../schema';

export type CreateAutopilotRunInput = {
  triggerKind: AutopilotRunTriggerKind;
  status: AutopilotRunStatus;
  currentStep?: string;
  discoveryRunId?: string | null;
  discoveredJobCount?: number;
  eligibleJobCount?: number;
  skippedJobCount?: number;
  submittedCount?: number;
  blockedCount?: number;
  failedCount?: number;
  errorMessage?: string | null;
  createdAt?: Date;
  startedAt?: Date | null;
  completedAt?: Date | null;
  updatedAt?: Date;
  id?: string;
};

export type UpdateAutopilotRunInput = Partial<
  Pick<
    AutopilotRunRecord,
    | 'status'
    | 'currentStep'
    | 'discoveryRunId'
    | 'discoveredJobCount'
    | 'eligibleJobCount'
    | 'skippedJobCount'
    | 'submittedCount'
    | 'blockedCount'
    | 'failedCount'
    | 'errorMessage'
    | 'startedAt'
    | 'completedAt'
    | 'updatedAt'
  >
>;

function mapAutopilotRun(
  record: typeof autopilotRunsTable.$inferSelect
): AutopilotRunRecord {
  return autopilotRunRecordSchema.parse({
    ...record,
    discoveryRunId: record.discoveryRunId ?? null,
    errorMessage: record.errorMessage ?? null,
    startedAt: record.startedAt ?? null,
    completedAt: record.completedAt ?? null
  });
}

export class AutopilotRunsRepository {
  constructor(private readonly db: JobAutomationDatabase) {}

  async list(): Promise<AutopilotRunRecord[]> {
    const records = await this.db
      .select()
      .from(autopilotRunsTable)
      .orderBy(desc(autopilotRunsTable.createdAt));

    return records.map(mapAutopilotRun);
  }

  async findById(id: string): Promise<AutopilotRunRecord | null> {
    const record = await this.db.query.autopilotRunsTable.findFirst({
      where: eq(autopilotRunsTable.id, id)
    });

    return record ? mapAutopilotRun(record) : null;
  }

  async create(input: CreateAutopilotRunInput): Promise<AutopilotRunRecord> {
    const createdAt = input.createdAt ?? new Date();
    const record = {
      id: input.id ?? randomUUID(),
      triggerKind: input.triggerKind,
      status: input.status,
      currentStep: input.currentStep ?? 'queued',
      discoveryRunId: input.discoveryRunId ?? null,
      discoveredJobCount: input.discoveredJobCount ?? 0,
      eligibleJobCount: input.eligibleJobCount ?? 0,
      skippedJobCount: input.skippedJobCount ?? 0,
      submittedCount: input.submittedCount ?? 0,
      blockedCount: input.blockedCount ?? 0,
      failedCount: input.failedCount ?? 0,
      errorMessage: input.errorMessage ?? null,
      createdAt,
      startedAt: input.startedAt ?? null,
      completedAt: input.completedAt ?? null,
      updatedAt: input.updatedAt ?? createdAt
    };

    await this.db.insert(autopilotRunsTable).values(record);
    return mapAutopilotRun(record);
  }

  async update(
    id: string,
    input: UpdateAutopilotRunInput
  ): Promise<AutopilotRunRecord | null> {
    const existing = await this.findById(id);
    if (!existing) {
      return null;
    }

    const record = {
      ...existing,
      ...input,
      updatedAt: input.updatedAt ?? new Date()
    };

    await this.db
      .update(autopilotRunsTable)
      .set({
        triggerKind: record.triggerKind,
        status: record.status,
        currentStep: record.currentStep,
        discoveryRunId: record.discoveryRunId,
        discoveredJobCount: record.discoveredJobCount,
        eligibleJobCount: record.eligibleJobCount,
        skippedJobCount: record.skippedJobCount,
        submittedCount: record.submittedCount,
        blockedCount: record.blockedCount,
        failedCount: record.failedCount,
        errorMessage: record.errorMessage,
        startedAt: record.startedAt,
        completedAt: record.completedAt,
        updatedAt: record.updatedAt
      })
      .where(eq(autopilotRunsTable.id, id));

    return this.findById(id);
  }
}
