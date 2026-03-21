import { z } from 'zod';

import { jobStatusSchema } from './status';

const filterTextSchema = z
  .union([z.string(), z.undefined()])
  .transform((value) => {
    if (value == null) {
      return undefined;
    }

    const normalized = value.trim();
    return normalized.length === 0 ? undefined : normalized;
  });

const optionalStatusFilterSchema = z
  .union([jobStatusSchema, z.literal(''), z.undefined()])
  .transform((value) => {
    if (value == null || value === '') {
      return undefined;
    }

    return value;
  });

export const jobRecordSchema = z.object({
  id: z.string().min(1),
  sourceKind: z.string().min(1),
  sourceId: z.string().min(1),
  sourceUrl: z.string().url(),
  companyName: z.string().min(1),
  title: z.string().min(1),
  location: z.string().default(''),
  remoteType: z.string().default('unknown'),
  employmentType: z.string().nullable(),
  compensationText: z.string().nullable(),
  descriptionText: z.string().default(''),
  rawPayload: z.string().nullable(),
  discoveryRunId: z.string().nullable(),
  status: jobStatusSchema,
  reviewNotes: z.string().default(''),
  reviewSummary: z.string().nullable(),
  reviewScore: z.number().int().min(0).max(100).nullable(),
  reviewScoreReasoning: z.string().nullable(),
  reviewUpdatedAt: z.date().nullable(),
  reviewScoreUpdatedAt: z.date().nullable(),
  discoveredAt: z.date(),
  updatedAt: z.date()
});

export const jobListFiltersSchema = z.object({
  sourceKind: filterTextSchema,
  status: optionalStatusFilterSchema,
  remoteType: filterTextSchema,
  title: filterTextSchema,
  location: filterTextSchema,
  companyName: filterTextSchema
});

const optionalPageInt = z.preprocess((val) => {
  if (val === '' || val === undefined || val === null) {
    return undefined;
  }
  const n = Number(val);
  return Number.isFinite(n) ? n : undefined;
}, z.number().int().min(1).optional());

const optionalPageSizeInt = z.preprocess((val) => {
  if (val === '' || val === undefined || val === null) {
    return undefined;
  }
  const n = Number(val);
  return Number.isFinite(n) ? n : undefined;
}, z.number().int().min(1).max(100).optional());

export const jobListPaginationSchema = z.object({
  page: optionalPageInt,
  pageSize: optionalPageSizeInt
});

export const jobListQuerySchema = jobListFiltersSchema.merge(jobListPaginationSchema);

/** Default page size for paginated job lists (dashboard). */
export const JOB_LIST_DEFAULT_PAGE_SIZE = 25;

export const jobReviewPatchSchema = z
  .object({
    status: jobStatusSchema.optional(),
    reviewNotes: z.string().max(4000).optional()
  })
  .refine((value) => value.status !== undefined || value.reviewNotes !== undefined, {
    message: 'At least one review field must be provided.'
  });

export type JobRecord = z.infer<typeof jobRecordSchema>;
export type JobListFilters = z.infer<typeof jobListFiltersSchema>;
export type JobListPagination = z.infer<typeof jobListPaginationSchema>;
export type JobListQuery = z.infer<typeof jobListQuerySchema>;
export type JobReviewPatch = z.infer<typeof jobReviewPatchSchema>;
