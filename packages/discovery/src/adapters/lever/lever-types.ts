import { z } from 'zod';

const leverListSchema = z.object({
  text: z.string().nullish().transform((value) => value ?? ''),
  content: z.string().nullish().transform((value) => value ?? '')
});

export const leverJobSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  hostedUrl: z.string().url(),
  createdAt: z.number().int().positive().nullish(),
  description: z.string().nullish().transform((value) => value ?? ''),
  descriptionBody: z.string().nullish().transform((value) => value ?? ''),
  descriptionBodyPlain: z.string().nullish().transform((value) => value ?? ''),
  descriptionPlain: z.string().nullish().transform((value) => value ?? ''),
  openingPlain: z.string().nullish().transform((value) => value ?? ''),
  additionalPlain: z.string().nullish().transform((value) => value ?? ''),
  lists: z.array(leverListSchema).nullish().transform((value) => value ?? []),
  salaryDescription: z.string().nullish().transform((value) => value ?? ''),
  workplaceType: z.string().nullish().transform((value) => value ?? ''),
  categories: z
    .object({
      commitment: z.string().nullish().transform((value) => value ?? ''),
      location: z.string().nullish().transform((value) => value ?? ''),
      team: z.string().nullish().transform((value) => value ?? ''),
      allLocations: z.array(z.string()).nullish().transform((value) => value ?? [])
    })
    .nullish()
    .transform((value) => value ?? { commitment: '', location: '', team: '', allLocations: [] })
}).passthrough();

export const leverJobsResponseSchema = z.array(leverJobSchema);

export type LeverJob = z.infer<typeof leverJobSchema>;
