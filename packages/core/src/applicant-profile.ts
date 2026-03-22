import { z } from 'zod';

import { jobKeywordProfileSchema } from './job-keyword-profile';

export const applicantProfileSchema = z.object({
  id: z.string().default('default'),
  fullName: z.string().min(1).default(''),
  email: z.string().email().or(z.literal('')).default(''),
  phone: z.string().default(''),
  location: z.string().default(''),
  summary: z.string().default(''),
  reusableContext: z.string().default(''),
  linkedinUrl: z.string().url().or(z.literal('')).default(''),
  websiteUrl: z.string().url().or(z.literal('')).default(''),
  baseResumeFileName: z.string().default(''),
  baseResumeTex: z.string().default(''),
  preferredCountries: z.array(z.string().length(2)).default([]),
  jobKeywordProfile: jobKeywordProfileSchema.nullable().default(null),
  jobKeywordProfileGeneratedAt: z.coerce.date().nullable().default(null),
  updatedAt: z.date()
});

export const applicantProfileInputSchema = applicantProfileSchema
  .omit({
    updatedAt: true
  })
  .extend({
    jobKeywordProfile: jobKeywordProfileSchema.nullable().optional(),
    jobKeywordProfileGeneratedAt: z.coerce.date().nullable().optional()
  });

export type ApplicantProfile = z.infer<typeof applicantProfileSchema>;
export type ApplicantProfileInput = z.infer<typeof applicantProfileInputSchema>;
