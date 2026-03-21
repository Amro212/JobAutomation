import { randomUUID } from 'node:crypto';

import { and, count, desc, eq, like } from 'drizzle-orm';

import {
  jobRecordSchema,
  type JobListFilters,
  type JobRecord,
  type JobReviewPatch,
  type JobStatus
} from '@jobautomation/core';

import type { JobAutomationDatabase } from '../client';
import { jobsTable } from '../schema';

export type UpsertJobInput = Omit<
  JobRecord,
  | 'id'
  | 'reviewNotes'
  | 'reviewSummary'
  | 'reviewScore'
  | 'reviewScoreReasoning'
  | 'reviewUpdatedAt'
  | 'reviewScoreUpdatedAt'
> &
  Partial<
    Pick<
      JobRecord,
      | 'reviewNotes'
      | 'reviewSummary'
      | 'reviewScore'
      | 'reviewScoreReasoning'
      | 'reviewUpdatedAt'
      | 'reviewScoreUpdatedAt'
    >
  > & {
  id?: string;
};

export type UpdateJobReviewInput = JobReviewPatch &
  Partial<
    Pick<
      JobRecord,
      'reviewSummary' | 'reviewScore' | 'reviewScoreReasoning' | 'reviewUpdatedAt' | 'reviewScoreUpdatedAt'
    >
  >;

function mapJobRecord(record: typeof jobsTable.$inferSelect): JobRecord {
  return jobRecordSchema.parse(record);
}

export class JobsRepository {
  constructor(private readonly db: JobAutomationDatabase) {}

  async list(
    filters: JobListFilters = {},
    pagination?: { page: number; pageSize: number }
  ): Promise<{ jobs: JobRecord[]; total: number }> {
    const conditions = [];

    if (filters.sourceKind) {
      conditions.push(eq(jobsTable.sourceKind, filters.sourceKind));
    }

    if (filters.status) {
      conditions.push(eq(jobsTable.status, filters.status));
    }

    if (filters.remoteType) {
      conditions.push(eq(jobsTable.remoteType, filters.remoteType));
    }

    if (filters.title) {
      conditions.push(like(jobsTable.title, `%${filters.title}%`));
    }

    if (filters.location) {
      conditions.push(like(jobsTable.location, `%${filters.location}%`));
    }

    if (filters.companyName) {
      conditions.push(like(jobsTable.companyName, `%${filters.companyName}%`));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const countQuery = this.db.select({ total: count() }).from(jobsTable);
    const [{ total }] = whereClause
      ? await countQuery.where(whereClause)
      : await countQuery;

    const baseSelect = this.db.select().from(jobsTable);
    const filtered = whereClause ? baseSelect.where(whereClause) : baseSelect;
    const ordered = filtered.orderBy(desc(jobsTable.updatedAt));

    const records = pagination
      ? await ordered
          .limit(pagination.pageSize)
          .offset((pagination.page - 1) * pagination.pageSize)
      : await ordered;

    return { jobs: records.map(mapJobRecord), total };
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
    const nextStatus: JobStatus = input.status;
    const reviewNotes = input.reviewNotes ?? existing?.reviewNotes ?? '';
    const reviewSummary =
      input.reviewSummary === undefined ? existing?.reviewSummary ?? null : input.reviewSummary;
    const reviewScore =
      input.reviewScore === undefined ? existing?.reviewScore ?? null : input.reviewScore;
    const reviewScoreReasoning =
      input.reviewScoreReasoning === undefined
        ? existing?.reviewScoreReasoning ?? null
        : input.reviewScoreReasoning;
    const reviewUpdatedAt =
      input.reviewUpdatedAt === undefined ? existing?.reviewUpdatedAt ?? null : input.reviewUpdatedAt;
    const reviewScoreUpdatedAt =
      input.reviewScoreUpdatedAt === undefined
        ? existing?.reviewScoreUpdatedAt ?? null
        : input.reviewScoreUpdatedAt;

    const updateSet: Record<string, unknown> = {
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
      status: nextStatus,
      discoveredAt: input.discoveredAt,
      updatedAt: input.updatedAt
    };

    if ('reviewNotes' in input) {
      updateSet.reviewNotes = reviewNotes;
    }

    if ('reviewSummary' in input) {
      updateSet.reviewSummary = reviewSummary;
    }

    if ('reviewScore' in input) {
      updateSet.reviewScore = reviewScore;
    }

    if ('reviewScoreReasoning' in input) {
      updateSet.reviewScoreReasoning = reviewScoreReasoning;
    }

    if ('reviewUpdatedAt' in input) {
      updateSet.reviewUpdatedAt = reviewUpdatedAt;
    }

    if ('reviewScoreUpdatedAt' in input) {
      updateSet.reviewScoreUpdatedAt = reviewScoreUpdatedAt;
    }

    await this.db
      .insert(jobsTable)
      .values({
        ...input,
        id: recordId,
        reviewNotes,
        reviewSummary,
        reviewScore,
        reviewScoreReasoning,
        reviewUpdatedAt,
        reviewScoreUpdatedAt
      })
      .onConflictDoUpdate({
        target: [jobsTable.sourceKind, jobsTable.sourceId],
        set: updateSet
      });

    const persisted = await this.findById(recordId);
    if (!persisted) {
      throw new Error(`Persisted job ${recordId} was not found.`);
    }

    return persisted;
  }

  async updateReview(id: string, input: UpdateJobReviewInput): Promise<JobRecord | null> {
    const existing = await this.findById(id);

    if (!existing) {
      return null;
    }

    const updateSet: Record<string, unknown> = {};

    if (input.status !== undefined) {
      updateSet.status = input.status;
    }

    if (input.reviewNotes !== undefined) {
      updateSet.reviewNotes = input.reviewNotes;
    }

    if (input.reviewSummary !== undefined) {
      updateSet.reviewSummary = input.reviewSummary;
    }

    if (input.reviewScore !== undefined) {
      updateSet.reviewScore = input.reviewScore;
    }

    if (input.reviewScoreReasoning !== undefined) {
      updateSet.reviewScoreReasoning = input.reviewScoreReasoning;
    }

    if (input.status !== undefined || input.reviewNotes !== undefined || input.reviewUpdatedAt !== undefined) {
      updateSet.reviewUpdatedAt = input.reviewUpdatedAt ?? new Date();
    }

    if (
      input.reviewSummary !== undefined ||
      input.reviewScore !== undefined ||
      input.reviewScoreReasoning !== undefined ||
      input.reviewScoreUpdatedAt !== undefined
    ) {
      updateSet.reviewScoreUpdatedAt = input.reviewScoreUpdatedAt ?? new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      return existing;
    }

    await this.db.update(jobsTable).set(updateSet).where(eq(jobsTable.id, id));

    return this.findById(id);
  }
}
