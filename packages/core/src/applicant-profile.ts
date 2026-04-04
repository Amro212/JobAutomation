import { z } from 'zod';

import { minimalAutofillProfileSchema } from './autofill-profile';
import { jobKeywordProfileSchema } from './job-keyword-profile';
import { extendedProfileSchema } from './extended-profile';

/**
 * Trim; empty stays empty. If there is no `scheme:` prefix, prepend `https://` so bare hosts
 * (e.g. `itsamro.me`) satisfy `.url()`.
 */
export function normalizeOptionalHttpUrl(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed === '') {
    return '';
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed.replace(/^\/+/, '')}`;
}

const optionalHttpUrlField = z
  .string()
  .default('')
  .transform(normalizeOptionalHttpUrl)
  .pipe(z.union([z.string().url(), z.literal('')]));

export const applicantProfileSchema = z.object({
  id: z.string().default('default'),
  fullName: z.string().min(1).default(''),
  email: z.string().email().or(z.literal('')).default(''),
  phone: z.string().default(''),
  location: z.string().default(''),
  summary: z.string().default(''),
  reusableContext: z.string().default(''),
  linkedinUrl: optionalHttpUrlField,
  websiteUrl: optionalHttpUrlField,
  baseResumeFileName: z.string().default(''),
  baseResumeTex: z.string().default(''),
  preferredCountries: z.array(z.string().length(2)).default([]),
  jobKeywordProfile: jobKeywordProfileSchema.nullable().default(null),
  jobKeywordProfileGeneratedAt: z.coerce.date().nullable().default(null),
  autofillProfile: minimalAutofillProfileSchema,
  extendedProfile: extendedProfileSchema.nullable().default(null),
  updatedAt: z.date()
});

export const applicantProfileInputSchema = applicantProfileSchema
  .omit({
    updatedAt: true
  })
  .extend({
    jobKeywordProfile: jobKeywordProfileSchema.nullable().optional(),
    jobKeywordProfileGeneratedAt: z.coerce.date().nullable().optional(),
    autofillProfile: minimalAutofillProfileSchema.optional(),
    extendedProfile: extendedProfileSchema.nullable().optional()
  });

export type ApplicantProfile = z.infer<typeof applicantProfileSchema>;
export type ApplicantProfileInput = z.infer<typeof applicantProfileInputSchema>;
