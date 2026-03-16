import { z } from 'zod';

const ashbyCompensationSchema = z
  .object({
    compensationTierSummary: z.string().nullish().transform((value) => value ?? ''),
    scrapeableCompensationSalarySummary: z.string().nullish().transform((value) => value ?? '')
  })
  .nullish()
  .transform((value) => value ?? { compensationTierSummary: '', scrapeableCompensationSalarySummary: '' });

export const ashbyJobSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    employmentType: z.string().nullish().transform((value) => value ?? ''),
    location: z.string().nullish().transform((value) => value ?? ''),
    publishedAt: z.string().datetime({ offset: true }),
    isListed: z.boolean().nullish().transform((value) => value ?? true),
    isRemote: z.boolean().nullish().transform((value) => value ?? false),
    workplaceType: z.string().nullish().transform((value) => value ?? ''),
    jobUrl: z.string().url(),
    applyUrl: z.string().url().nullish().transform((value) => value ?? null),
    descriptionHtml: z.string().nullish().transform((value) => value ?? ''),
    descriptionPlain: z.string().nullish().transform((value) => value ?? ''),
    shouldDisplayCompensationOnJobPostings: z.boolean().nullish().transform((value) => value ?? false),
    compensation: ashbyCompensationSchema,
    secondaryLocations: z
      .array(
        z.object({
          location: z.string().nullish().transform((value) => value ?? '')
        })
      )
      .nullish()
      .transform((value) => value ?? [])
  })
  .passthrough();

export const ashbyJobsResponseSchema = z.object({
  jobs: z.array(ashbyJobSchema),
  apiVersion: z.string().nullish()
});

export type AshbyJob = z.infer<typeof ashbyJobSchema>;
