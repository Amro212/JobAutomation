import { z } from 'zod';

export const leverJobSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  hostedUrl: z.string().url(),
  createdAt: z.number().int().positive().nullish(),
  descriptionPlain: z.string().nullish().transform((value) => value ?? ''),
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
});

export const leverJobsResponseSchema = z.array(leverJobSchema);

export type LeverJob = z.infer<typeof leverJobSchema>;
