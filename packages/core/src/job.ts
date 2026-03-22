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

function prefilterPassFromDb(value: unknown): boolean | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (value === true || value === 1) {
    return true;
  }
  if (value === false || value === 0) {
    return false;
  }
  return null;
}

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
  updatedAt: z.date(),
  prefilterPass: z.preprocess(prefilterPassFromDb, z.boolean().nullable()),
  prefilterReasonsJson: z.string().nullable()
});

const optionalMatchProfileSchema = z.preprocess((val) => {
  if (val === 'me' || val === 'all') {
    return val;
  }
  if (val === '' || val === null || val === undefined) {
    return undefined;
  }
  return undefined;
}, z.enum(['me', 'all']).optional());

const optionalCountryCodesSchema = z.preprocess((val) => {
  if (val === undefined || val === null || val === '') {
    return undefined;
  }
  if (typeof val === 'string') {
    return [val.toUpperCase()];
  }
  if (Array.isArray(val)) {
    const codes = val
      .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
      .map((v) => v.toUpperCase());
    return codes.length > 0 ? codes : undefined;
  }
  return undefined;
}, z.array(z.string().length(2)).optional());

export const jobListFiltersSchema = z.object({
  sourceKind: filterTextSchema,
  status: optionalStatusFilterSchema,
  remoteType: filterTextSchema,
  title: filterTextSchema,
  location: filterTextSchema,
  companyName: filterTextSchema,
  locationCountries: optionalCountryCodesSchema,
  /** When `me`, list only jobs that pass the applicant pre-filter (requires cached `prefilter_pass` on rows). */
  matchProfile: optionalMatchProfileSchema
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

export const jobListItemSchema = z.object({
  id: z.string().min(1),
  companyName: z.string().min(1),
  title: z.string().min(1),
  sourceKind: z.string().min(1),
  location: z.string().default(''),
  remoteType: z.string().default('unknown'),
  status: jobStatusSchema
});

export type JobRecord = z.infer<typeof jobRecordSchema>;
export type JobListItem = z.infer<typeof jobListItemSchema>;
export type JobListFilters = z.infer<typeof jobListFiltersSchema>;
export type JobListPagination = z.infer<typeof jobListPaginationSchema>;
export type JobListQuery = z.infer<typeof jobListQuerySchema>;
export type JobReviewPatch = z.infer<typeof jobReviewPatchSchema>;
