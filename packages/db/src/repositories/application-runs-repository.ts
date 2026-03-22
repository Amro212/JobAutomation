import { randomUUID } from 'node:crypto';

import { desc, eq } from 'drizzle-orm';

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
  constructor(private readonly db: JobAutomationDatabase) {}

  async list(): Promise<ApplicationRunRecord[]> {
    const records = await this.db
      .select()
      .from(applicationRunsTable)
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

  async findById(id: string): Promise<ApplicationRunRecord | null> {
    const record = await this.db.query.applicationRunsTable.findFirst({
      where: eq(applicationRunsTable.id, id)
    });

    return record ? mapApplicationRun(record) : null;
  }

  async create(input: CreateApplicationRunInput): Promise<ApplicationRunRecord> {
    const record = {
      id: input.id ?? randomUUID(),
      jobId: input.jobId,
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

    return this.findById(id);
  }
}
