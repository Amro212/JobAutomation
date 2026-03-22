import { z } from 'zod';

/** Greenhouse sometimes returns `value` as an array (e.g. multi-select custom fields). */
const greenhouseMetadataValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.unknown())
]);

const greenhouseMetadataEntrySchema = z.object({
  name: z.string().default(''),
  value: greenhouseMetadataValueSchema.nullable().optional(),
  value_type: z.string().optional().default('')
});

const greenhousePayRangeSchema = z.object({
  title: z.string().optional().default(''),
  blurb: z.string().optional().default(''),
  currency_type: z.string().optional().default(''),
  min_cents: z.number().optional(),
  max_cents: z.number().optional()
});

export const greenhouseJobSchema = z.object({
  id: z.union([z.number(), z.string()]),
  absolute_url: z.string().url(),
  title: z.string().min(1),
  updated_at: z.string().min(1),
  content: z.string().nullish().transform((value) => value ?? ''),
  location: z
    .object({
      name: z.string().nullish().transform((value) => value ?? '')
    })
    .nullish()
    .transform((value) => value ?? { name: '' }),
  metadata: z
    .array(greenhouseMetadataEntrySchema)
    .nullish()
    .transform((value) => value ?? []),
  pay_input_ranges: z
    .array(greenhousePayRangeSchema)
    .nullish()
    .transform((value) => value ?? [])
});

export const greenhouseJobsResponseSchema = z.object({
  jobs: z.array(greenhouseJobSchema)
});

export type GreenhouseJob = z.infer<typeof greenhouseJobSchema>;
export type GreenhouseJobsResponse = z.infer<typeof greenhouseJobsResponseSchema>;