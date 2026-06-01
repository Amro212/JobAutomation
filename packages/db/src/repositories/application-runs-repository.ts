import { randomUUID } from 'node:crypto';

import { and, count, desc, eq, inArray } from 'drizzle-orm';

import {
  applicationRunRecordSchema,
  prefilterReasonSchema,
  type ApplicationRunRecord,
  type ApplicationRunStatus,
  type ApplicationRunType,
  type PrefilterReason
} from '@jobautomation/core';

import type { JobAutomationDatabase } from '../client';
import { applicationRunsTable } from '../schema';

export type CreateApplicationRunInput = {
  jobId: string;
  autopilotRunId?: string | null;
  siteKey: ApplicationRunType;
  status: ApplicationRunStatus;
  currentStep: string;
  stopReason?: string | null;
  prefilterReasons?: PrefilterReason[];
  reviewUrl?: string | null;
  resumeArtifactId?: string | null;
  coverLetterArtifactId?: string | null;
  startedAt?: Date | null;
  completedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
  id?: string;
};

export type UpdateApplicationRunInput = Partial<
  Pick<
    ApplicationRunRecord,
    | 'siteKey'
    | 'status'
    | 'currentStep'
    | 'autopilotRunId'
    | 'stopReason'
    | 'prefilterReasons'
    | 'reviewUrl'
    | 'resumeArtifactId'
    | 'coverLetterArtifactId'
    | 'startedAt'
    | 'completedAt'
    | 'updatedAt'
  >
>;

function parsePrefilterReasonsJson(raw: string | null): PrefilterReason[] {
  if (raw == null || raw.trim() === '') {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    const result = prefilterReasonSchema.array().safeParse(parsed);
    return result.success ? result.data : [];
  } catch {
    return [];
  }
}

function mapApplicationRun(record: typeof applicationRunsTable.$inferSelect): ApplicationRunRecord {
  return applicationRunRecordSchema.parse({
    id: record.id,
    jobId: record.jobId,
    autopilotRunId: record.autopilotRunId ?? null,
    siteKey: record.siteKey,
    status: record.status,
    currentStep: record.currentStep,
    stopReason: record.stopReason ?? null,
    prefilterReasons: parsePrefilterReasonsJson(record.prefilterReasonsJson),
    reviewUrl: record.reviewUrl ?? null,
    resumeArtifactId: record.resumeArtifactId ?? null,
    coverLetterArtifactId: record.coverLetterArtifactId ?? null,
    createdAt: record.createdAt,
    startedAt: record.startedAt ?? null,
    completedAt: record.completedAt ?? null,
    updatedAt: record.updatedAt
  });
}

export class ApplicationRunsRepository {
  constructor(private readonly db: JobAutomationDatabase) { }

  async list(): Promise<ApplicationRunRecord[]> {
    const records = await this.db
      .select()
      .from(applicationRunsTable)
      .orderBy(desc(applicationRunsTable.updatedAt));

    return records.map(mapApplicationRun);
  }

  async listPaginated(
    pagination: { page: number; pageSize: number },
    options?: { statuses?: ApplicationRunStatus[] }
  ): Promise<{ runs: ApplicationRunRecord[]; total: number }> {
    const whereClause =
      options?.statuses && options.statuses.length > 0
        ? inArray(applicationRunsTable.status, options.statuses)
        : undefined;

    const countQuery = this.db.select({ total: count() }).from(applicationRunsTable);
    const [{ total }] = whereClause
      ? await countQuery.where(whereClause)
      : await countQuery;

    const baseSelect = this.db.select().from(applicationRunsTable);
    const filtered = whereClause ? baseSelect.where(whereClause) : baseSelect;
    const records = await filtered
      .orderBy(desc(applicationRunsTable.updatedAt))
      .limit(pagination.pageSize)
      .offset((pagination.page - 1) * pagination.pageSize);

    return { runs: records.map(mapApplicationRun), total };
  }

  async getStats(): Promise<{ total: number; completedCount: number; failedCount: number; cancelledCount: number; skippedCount: number }> {
    const statsQuery = await this.db
      .select({
        status: applicationRunsTable.status,
        c: count()
      })
      .from(applicationRunsTable)
      .groupBy(applicationRunsTable.status);

    let total = 0;
    let completedCount = 0;
    let failedCount = 0;
    let cancelledCount = 0;
    let skippedCount = 0;

    for (const row of statsQuery) {
      const countVal = Number(row.c);
      total += countVal;
      if (row.status === 'completed') completedCount += countVal;
      else if (row.status === 'failed') failedCount += countVal;
      else if (row.status === 'cancelled') cancelledCount += countVal;
      else if (row.status === 'skipped') skippedCount += countVal;
    }

    return { total, completedCount, failedCount, cancelledCount, skippedCount };
  }

  /** Fetch runs filtered by status — avoids loading all runs for stale recovery. */
  async listByStatus(statuses: string[]): Promise<ApplicationRunRecord[]> {
    if (statuses.length === 0) {
      return [];
    }

    const records = await this.db
      .select()
      .from(applicationRunsTable)
      .where(inArray(applicationRunsTable.status, statuses))
      .orderBy(desc(applicationRunsTable.updatedAt));

    return records.map(mapApplicationRun);
  }

  async listByJob(jobId: string): Promise<ApplicationRunRecord[]> {
    const records = await this.db
      .select()
      .from(applicationRunsTable)
      .where(eq(applicationRunsTable.jobId, jobId))
      .orderBy(desc(applicationRunsTable.updatedAt));

    return records.map(mapApplicationRun);
  }

  async completedJobIds(jobIds: string[]): Promise<Set<string>> {
    if (jobIds.length === 0) {
      return new Set();
    }

    const records = await this.db
      .select({ jobId: applicationRunsTable.jobId })
      .from(applicationRunsTable)
      .where(
        and(
          inArray(applicationRunsTable.jobId, jobIds),
          eq(applicationRunsTable.status, 'completed')
        )
      );

    return new Set(records.map((record) => record.jobId));
  }

  async listByAutopilotRun(autopilotRunId: string): Promise<ApplicationRunRecord[]> {
    const records = await this.db
      .select()
      .from(applicationRunsTable)
      .where(eq(applicationRunsTable.autopilotRunId, autopilotRunId))
      .orderBy(desc(applicationRunsTable.updatedAt));

    return records.map(mapApplicationRun);
  }

  async findById(id: string): Promise<ApplicationRunRecord | null> {
    const record = await this.db.query.applicationRunsTable.findFirst({
      where: eq(applicationRunsTable.id, id)
    });

    return record ? mapApplicationRun(record) : null;
  }

  /** Batch fetch by IDs — eliminates N+1 queries when resolving artifacts for run lists. */
  async findByIds(ids: string[]): Promise<Map<string, ApplicationRunRecord>> {
    if (ids.length === 0) {
      return new Map();
    }

    const records = await this.db
      .select()
      .from(applicationRunsTable)
      .where(inArray(applicationRunsTable.id, ids));

    const map = new Map<string, ApplicationRunRecord>();
    for (const record of records) {
      map.set(record.id, mapApplicationRun(record));
    }
    return map;
  }

  async create(input: CreateApplicationRunInput): Promise<ApplicationRunRecord> {
    const record = {
      id: input.id ?? randomUUID(),
      jobId: input.jobId,
      autopilotRunId: input.autopilotRunId ?? null,
      siteKey: input.siteKey,
      status: input.status,
      currentStep: input.currentStep,
      stopReason: input.stopReason ?? null,
      prefilterReasonsJson: JSON.stringify(input.prefilterReasons ?? []),
      reviewUrl: input.reviewUrl ?? null,
      resumeArtifactId: input.resumeArtifactId ?? null,
      coverLetterArtifactId: input.coverLetterArtifactId ?? null,
      createdAt: input.createdAt ?? new Date(),
      startedAt: input.startedAt ?? null,
      completedAt: input.completedAt ?? null,
      updatedAt: input.updatedAt ?? input.createdAt ?? new Date()
    };

    await this.db.insert(applicationRunsTable).values(record);

    return mapApplicationRun(record);
  }

  async update(id: string, input: UpdateApplicationRunInput): Promise<ApplicationRunRecord | null> {
    const existing = await this.findById(id);

    if (!existing) {
      return null;
    }

    const record = {
      ...existing,
      ...input,
      prefilterReasons: input.prefilterReasons ?? existing.prefilterReasons,
      updatedAt: input.updatedAt ?? new Date()
    };

    const updateSet: Record<string, unknown> = {
      siteKey: record.siteKey,
      status: record.status,
      currentStep: record.currentStep,
      autopilotRunId: record.autopilotRunId,
      stopReason: record.stopReason,
      prefilterReasonsJson: JSON.stringify(record.prefilterReasons),
      reviewUrl: record.reviewUrl,
      resumeArtifactId: record.resumeArtifactId,
      coverLetterArtifactId: record.coverLetterArtifactId,
      startedAt: record.startedAt,
      completedAt: record.completedAt,
      updatedAt: record.updatedAt
    };

    await this.db.update(applicationRunsTable).set(updateSet).where(eq(applicationRunsTable.id, id));

    // Return the merged record directly instead of re-reading from DB
    return applicationRunRecordSchema.parse(record);
  }
}
