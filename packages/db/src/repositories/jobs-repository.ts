import { randomUUID } from 'node:crypto';

import { and, count, desc, eq, inArray, isNull, like, or, sql } from 'drizzle-orm';

import {
  buildLocationLikePatterns,
  JOB_MATCHER_VERSION,
  jobListItemSchema,
  jobRecordSchema,
  prefilterJob,
  type JobListFilters,
  type JobListItem,
  type JobRecord,
  type JobReviewPatch,
  type JobStatus,
  type PrefilterContext
} from '@jobautomation/core';

import type { JobAutomationDatabase } from '../client';
import { jobsTable, artifactsTable } from '../schema';

export type UpsertJobInput = Omit<
  JobRecord,
  | 'id'
  | 'prefilterPass'
  | 'prefilterScore'
  | 'prefilterReasonsJson'
  | 'prefilterSignalsJson'
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

function stalePrefilterWhereClause() {
  return or(
    isNull(jobsTable.prefilterSignalsJson),
    sql`${jobsTable.prefilterSignalsJson} not like ${`%"matcherVersion":"${JOB_MATCHER_VERSION}"%`}`
  );
}

export class JobsRepository {
  constructor(private readonly db: JobAutomationDatabase) {}

  private buildWhereClause(filters: JobListFilters) {
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

    if (filters.locationCountries && filters.locationCountries.length > 0) {
      const patterns = buildLocationLikePatterns(filters.locationCountries);
      const locationOr = patterns.map(
        (p) => sql`lower(${jobsTable.location}) like ${p}`
      );
      if (locationOr.length > 0) {
        conditions.push(or(...locationOr)!);
      }
    } else if (filters.location) {
      conditions.push(like(jobsTable.location, `%${filters.location}%`));
    }

    if (filters.companyName) {
      conditions.push(like(jobsTable.companyName, `%${filters.companyName}%`));
    }

    if (filters.matchProfile === 'me') {
      conditions.push(eq(jobsTable.prefilterPass, 1));
    }

    return conditions.length > 0 ? and(...conditions) : undefined;
  }

  async clearAllPrefilterResults(): Promise<void> {
    await this.db
      .update(jobsTable)
      .set({
        prefilterPass: null,
        prefilterScore: null,
        prefilterReasonsJson: null,
        prefilterSignalsJson: null
      });
  }

  /** Jobs with no cached pre-filter result yet (e.g. new row or invalidated). */
  async prefilterCacheStats(): Promise<{
    jobCount: number;
    nullPrefilterCount: number;
    stalePrefilterCount: number;
  }> {
    // Single query with conditional aggregation instead of 3 separate COUNT queries
    const stalePattern = `%"matcherVersion":"${JOB_MATCHER_VERSION}"%`;
    const [row] = await this.db
      .select({
        jobCount: count(),
        nullPrefilterCount: sql<number>`sum(case when ${jobsTable.prefilterPass} is null then 1 else 0 end)`,
        stalePrefilterCount: sql<number>`sum(case when ${jobsTable.prefilterSignalsJson} is null or ${jobsTable.prefilterSignalsJson} not like ${stalePattern} then 1 else 0 end)`
      })
      .from(jobsTable);

    return {
      jobCount: row.jobCount,
      nullPrefilterCount: row.nullPrefilterCount ?? 0,
      stalePrefilterCount: row.stalePrefilterCount ?? 0
    };
  }

  async recomputePrefilterForAllJobs(ctx: PrefilterContext): Promise<number> {
    const PAGE = 300;
    let offset = 0;
    let evaluated = 0;

    for (;;) {
      const rows = await this.db
        .select({
          id: jobsTable.id,
          title: jobsTable.title,
          location: jobsTable.location,
          remoteType: jobsTable.remoteType,
          descriptionText: jobsTable.descriptionText
        })
        .from(jobsTable)
        .orderBy(jobsTable.id)
        .limit(PAGE)
        .offset(offset);

      if (rows.length === 0) {
        break;
      }

      // Compute all results first, then batch-write inside a single transaction
      const updates = rows.map((row) => {
        const result = prefilterJob(row, ctx);
        return {
          id: row.id,
          prefilterPass: result.pass ? 1 : 0,
          prefilterScore: result.score,
          prefilterReasonsJson: JSON.stringify(result.reasons),
          prefilterSignalsJson: JSON.stringify(result.audit)
        };
      });

      await this.db.transaction(async (tx) => {
        for (const update of updates) {
          await tx
            .update(jobsTable)
            .set({
              prefilterPass: update.prefilterPass,
              prefilterScore: update.prefilterScore,
              prefilterReasonsJson: update.prefilterReasonsJson,
              prefilterSignalsJson: update.prefilterSignalsJson
            })
            .where(eq(jobsTable.id, update.id));
        }
      });

      evaluated += rows.length;
      offset += PAGE;
    }

    return evaluated;
  }

  async recomputeStalePrefilterJobs(ctx: PrefilterContext): Promise<number> {
    const PAGE = 300;
    let evaluated = 0;

    for (;;) {
      const rows = await this.db
        .select({
          id: jobsTable.id,
          title: jobsTable.title,
          location: jobsTable.location,
          remoteType: jobsTable.remoteType,
          descriptionText: jobsTable.descriptionText
        })
        .from(jobsTable)
        .where(stalePrefilterWhereClause())
        .orderBy(jobsTable.id)
        .limit(PAGE);

      if (rows.length === 0) {
        break;
      }

      // Compute all results first, then batch-write inside a single transaction
      const updates = rows.map((row) => {
        const result = prefilterJob(row, ctx);
        return {
          id: row.id,
          prefilterPass: result.pass ? 1 : 0,
          prefilterScore: result.score,
          prefilterReasonsJson: JSON.stringify(result.reasons),
          prefilterSignalsJson: JSON.stringify(result.audit)
        };
      });

      await this.db.transaction(async (tx) => {
        for (const update of updates) {
          await tx
            .update(jobsTable)
            .set({
              prefilterPass: update.prefilterPass,
              prefilterScore: update.prefilterScore,
              prefilterReasonsJson: update.prefilterReasonsJson,
              prefilterSignalsJson: update.prefilterSignalsJson
            })
            .where(eq(jobsTable.id, update.id));
        }
      });

      evaluated += rows.length;
    }

    return evaluated;
  }

  async updatePrefilterResult(
    id: string,
    input: {
      pass: boolean;
      score: number;
      reasons: string[];
      audit: unknown;
    }
  ): Promise<void> {
    await this.db
      .update(jobsTable)
      .set({
        prefilterPass: input.pass ? 1 : 0,
        prefilterScore: input.score,
        prefilterReasonsJson: JSON.stringify(input.reasons),
        prefilterSignalsJson: JSON.stringify(input.audit),
        updatedAt: new Date()
      })
      .where(eq(jobsTable.id, id));
  }

  async list(
    filters: JobListFilters = {},
    pagination?: { page: number; pageSize: number }
  ): Promise<{ jobs: JobRecord[]; total: number }> {
    const whereClause = this.buildWhereClause(filters);

    const countQuery = this.db.select({ total: count() }).from(jobsTable);
    const [{ total }] = whereClause
      ? await countQuery.where(whereClause)
      : await countQuery;

    const baseSelect = this.db.select().from(jobsTable);
    const filtered = whereClause ? baseSelect.where(whereClause) : baseSelect;
    const ordered =
      filters.matchProfile === 'me'
        ? filtered.orderBy(desc(jobsTable.prefilterScore), desc(jobsTable.updatedAt))
        : filtered.orderBy(desc(jobsTable.updatedAt));

    const records = pagination
      ? await ordered
          .limit(pagination.pageSize)
          .offset((pagination.page - 1) * pagination.pageSize)
      : await ordered;

    return { jobs: records.map(mapJobRecord), total };
  }

  async listIds(
    filters: JobListFilters = {},
    pagination?: { page: number; pageSize: number },
    options?: { skipCount?: boolean }
  ): Promise<{ ids: string[]; total: number }> {
    const whereClause = this.buildWhereClause(filters);

    // Allow callers like autopilot queue to skip the expensive COUNT query
    let total = 0;
    if (!options?.skipCount) {
      const countQuery = this.db.select({ total: count() }).from(jobsTable);
      const [countRow] = whereClause
        ? await countQuery.where(whereClause)
        : await countQuery;
      total = countRow.total;
    }

    const baseSelect = this.db.select({ id: jobsTable.id }).from(jobsTable);
    const filtered = whereClause ? baseSelect.where(whereClause) : baseSelect;
    const ordered =
      filters.matchProfile === 'me'
        ? filtered.orderBy(desc(jobsTable.prefilterScore), desc(jobsTable.updatedAt))
        : filtered.orderBy(desc(jobsTable.updatedAt));

    const records = pagination
      ? await ordered
          .limit(pagination.pageSize)
          .offset((pagination.page - 1) * pagination.pageSize)
      : await ordered;

    return { ids: records.map((record) => record.id), total };
  }

  async distinctCompanyNames(filters: JobListFilters = {}): Promise<string[]> {
    // Do not apply companyName here: the list populates the company filter UI;
    // including it would narrow distinct names to the current selection only.
    const whereClause = this.buildWhereClause({ ...filters, companyName: undefined });
    const base = this.db
      .selectDistinct({ companyName: jobsTable.companyName })
      .from(jobsTable);
    const filtered = whereClause ? base.where(whereClause) : base;
    const rows = await filtered.orderBy(jobsTable.companyName);
    return rows
      .map((r) => r.companyName)
      .filter((name) => name.trim().length > 0);
  }

  async listSummary(
    filters: JobListFilters = {},
    pagination?: { page: number; pageSize: number }
  ): Promise<{ jobs: JobListItem[]; total: number }> {
    const whereClause = this.buildWhereClause(filters);

    const countQuery = this.db.select({ total: count() }).from(jobsTable);
    const [{ total }] = whereClause
      ? await countQuery.where(whereClause)
      : await countQuery;

    const summaryColumns = {
      id: jobsTable.id,
      companyName: jobsTable.companyName,
      title: jobsTable.title,
      sourceKind: jobsTable.sourceKind,
      sourceUrl: jobsTable.sourceUrl,
      location: jobsTable.location,
      remoteType: jobsTable.remoteType,
      status: jobsTable.status,
      prefilterScore: jobsTable.prefilterScore,
      hasArtifacts: sql<boolean>`exists (select 1 from ${artifactsTable} where ${artifactsTable.jobId} = ${jobsTable.id})`.as('hasArtifacts')
    };

    const baseSelect = this.db.select(summaryColumns).from(jobsTable);
    const filtered = whereClause ? baseSelect.where(whereClause) : baseSelect;
    const ordered =
      filters.matchProfile === 'me'
        ? filtered.orderBy(desc(jobsTable.prefilterScore), desc(jobsTable.updatedAt))
        : filtered.orderBy(desc(jobsTable.updatedAt));

    const records = pagination
      ? await ordered
          .limit(pagination.pageSize)
          .offset((pagination.page - 1) * pagination.pageSize)
      : await ordered;

    return { jobs: records.map((r) => jobListItemSchema.parse(r)), total };
  }

  async findById(id: string): Promise<JobRecord | null> {
    const record = await this.db.query.jobsTable.findFirst({
      where: eq(jobsTable.id, id)
    });

    return record ? mapJobRecord(record) : null;
  }

  /** Batch fetch by IDs — eliminates N+1 queries when resolving jobs for run lists. */
  async findByIds(ids: string[]): Promise<Map<string, JobRecord>> {
    if (ids.length === 0) {
      return new Map();
    }

    const records = await this.db
      .select()
      .from(jobsTable)
      .where(inArray(jobsTable.id, ids));

    const map = new Map<string, JobRecord>();
    for (const record of records) {
      map.set(record.id, mapJobRecord(record));
    }
    return map;
  }

  /**
   * Batch fetch only the display fields needed for autopilot batch detail child-run rows.
   * Returns a slim object (id, title, companyName, location) instead of a full JobRecord,
   * keeping the API response small even when there are many child application runs.
   */
  async findSummariesByIds(
    ids: string[]
  ): Promise<Map<string, { id: string; title: string; companyName: string; location: string; sourceUrl: string }>> {
    if (ids.length === 0) {
      return new Map();
    }

    const records = await this.db
      .select({
        id: jobsTable.id,
        title: jobsTable.title,
        companyName: jobsTable.companyName,
        location: jobsTable.location,
        sourceUrl: jobsTable.sourceUrl
      })
      .from(jobsTable)
      .where(inArray(jobsTable.id, ids));

    const map = new Map<string, { id: string; title: string; companyName: string; location: string; sourceUrl: string }>();
    for (const record of records) {
      map.set(record.id, record);
    }
    return map;
  }

  async findBySource(sourceKind: string, sourceId: string): Promise<JobRecord | null> {
    const record = await this.db.query.jobsTable.findFirst({
      where: and(eq(jobsTable.sourceKind, sourceKind), eq(jobsTable.sourceId, sourceId))
    });

    return record ? mapJobRecord(record) : null;
  }

  async listByDiscoveryRun(discoveryRunId: string): Promise<JobRecord[]> {
    const records = await this.db
      .select()
      .from(jobsTable)
      .where(eq(jobsTable.discoveryRunId, discoveryRunId))
      .orderBy(desc(jobsTable.updatedAt));

    return records.map(mapJobRecord);
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

    const prefilterFieldsChanged =
      existing &&
      (existing.title !== input.title ||
        existing.location !== input.location ||
        existing.remoteType !== input.remoteType ||
        existing.descriptionText !== input.descriptionText);

    if (prefilterFieldsChanged) {
      updateSet.prefilterPass = null;
      updateSet.prefilterScore = null;
      updateSet.prefilterReasonsJson = null;
      updateSet.prefilterSignalsJson = null;
    }

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

  async updateStatus(id: string, status: JobStatus): Promise<void> {
    await this.db
      .update(jobsTable)
      .set({
        status,
        updatedAt: new Date()
      })
      .where(eq(jobsTable.id, id));
  }
}
